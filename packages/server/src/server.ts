import { mkdir } from 'node:fs/promises'
import { join, normalize, sep } from 'node:path'
import type { BunRequest, Server, ServerWebSocket } from 'bun'
import {
	ATTACHMENTS_DIR,
	type AttachmentResponse,
	type ClientMessage,
	dirname,
	type HomedocsUser,
	joinPath,
	type SaveDocRequest,
	type ServerMessage,
} from '@homedocs/shared'
import { type AuthResolver, type RequestContext, requireAdmin, requireEditor, toMe } from './auth'
import { config } from './config'
import { listEditorIds, setEditor, setShareEnabled } from './db'
import { createDoc, readDoc, writeDoc } from './docs'
import { createFolder, deleteEntry, moveEntry, sanitizeFileName, uniqueFileName } from './entries'
import { isHaAdmin, isPersonUser, listHaUsers } from './ha'
import { robotsResponse, serveFile } from './files'
import { errorResponse, HttpError, json, readJson, requireString } from './http'
import { LockManager } from './locks'
import { writeOrder } from './order'
import { cleanPath, safeResolve } from './paths'
import { readState, updateState } from './setup'
import {
	checkBaseUrl,
	createShare,
	deleteShare,
	deleteSharesInside,
	listShares,
	moveShares,
	setRemoteUrl,
	sharingSettings,
} from './shares'
import { buildTree } from './tree'

type WsData = { connId: string; ctx: RequestContext }

const TOPIC = 'homedocs'

export type ServerOptions = {
	port: number
	resolver: AuthResolver
}

export const createServer = ({ port, resolver }: ServerOptions) => {
	const locks = new LockManager()
	const sockets = new Map<string, ServerWebSocket<WsData>>()

	const send = (ws: ServerWebSocket<WsData>, message: ServerMessage) => ws.send(JSON.stringify(message))
	const broadcast = (message: ServerMessage) => server.publish(TOPIC, JSON.stringify(message))
	const broadcastLocks = () => broadcast({ type: 'locks', locks: locks.snapshot() })

	/** Resolves the user and turns thrown errors into JSON responses. */
	const handle =
		<R extends BunRequest>(fn: (req: R, ctx: RequestContext) => Response | Promise<Response>) =>
		async (req: R, srv: Server<WsData>): Promise<Response> => {
			try {
				return await fn(req, await resolver(req, srv))
			} catch (error) {
				return errorResponse(error)
			}
		}

	const assertNotLocked = (path: string) => {
		const holder = locks.lockedInside(path)
		if (holder) throw new HttpError(423, `${holder.name} is currently editing this`, { holder })
	}

	const server: Server<WsData> = Bun.serve<WsData>({
		port,
		hostname: '0.0.0.0',
		maxRequestBodySize: config.maxUploadBytes + 1024 * 1024,

		routes: {
			'/api/me': {
				GET: handle(async (_, ctx) => {
					const me = toMe(ctx)
					if (ctx.isAdmin) {
						const state = await readState()
						if (state.migratedFrom && !state.migrationNoticeDismissed) {
							me.migrationNotice = { docsPath: config.userDocsPath }
						}
					}
					return json(me)
				}),
			},

			'/api/migration-notice': {
				DELETE: handle(async (_, ctx) => {
					requireAdmin(ctx)
					await updateState({ migrationNoticeDismissed: true })
					return json({ ok: true })
				}),
			},

			'/api/tree': { GET: handle(async () => json(await buildTree())) },

			'/api/doc': {
				GET: handle(async (req) => {
					const path = requireString(new URL(req.url).searchParams.get('path'), 'path')
					return json(await readDoc(cleanPath(path)))
				}),
				POST: handle(async (req, ctx) => {
					requireEditor(ctx)
					const body = await readJson<{ path?: string; content?: string }>(req)
					const path = cleanPath(requireString(body.path, 'path'))
					const hash = await createDoc(path, body.content ?? '')
					broadcast({ type: 'tree.changed' })
					return json({ path, hash }, { status: 201 })
				}),
				PUT: handle(async (req, ctx) => {
					const user = requireEditor(ctx)
					const body = await readJson<Partial<SaveDocRequest>>(req)
					const path = cleanPath(requireString(body.path, 'path'))
					if (typeof body.content !== 'string') throw new HttpError(400, '"content" is required')

					const holder = locks.heldByOther(path, user.id)
					if (holder) throw new HttpError(423, `${holder.name} is currently editing this document`, { holder })

					const result = await writeDoc(path, body.content, body.baseHash ?? null, body.force === true)
					if (!result.ok) {
						return json({ error: 'conflict', currentHash: result.currentHash }, { status: 409 })
					}
					broadcast({ type: 'doc.saved', path, hash: result.hash, by: user.name })
					// the title may have changed
					broadcast({ type: 'tree.changed' })
					return json({ hash: result.hash })
				}),
			},

			'/api/folder': {
				POST: handle(async (req, ctx) => {
					requireEditor(ctx)
					const body = await readJson<{ path?: string }>(req)
					await createFolder(cleanPath(requireString(body.path, 'path')))
					broadcast({ type: 'tree.changed' })
					return json({ ok: true }, { status: 201 })
				}),
			},

			'/api/entry': {
				PATCH: handle(async (req, ctx) => {
					const user = requireEditor(ctx)
					const body = await readJson<{ from?: string; to?: string }>(req)
					const from = cleanPath(requireString(body.from, 'from'))
					const to = cleanPath(requireString(body.to, 'to'))
					assertNotLocked(from)
					await moveEntry(from, to)
					moveShares(from, to)
					broadcast({ type: 'doc.moved', from, to, by: user.name })
					broadcast({ type: 'tree.changed' })
					return json({ ok: true })
				}),
				DELETE: handle(async (req, ctx) => {
					const user = requireEditor(ctx)
					const path = cleanPath(requireString(new URL(req.url).searchParams.get('path'), 'path'))
					assertNotLocked(path)
					await deleteEntry(path)
					deleteSharesInside(path)
					broadcast({ type: 'doc.deleted', path, by: user.name })
					broadcast({ type: 'tree.changed' })
					return json({ ok: true })
				}),
			},

			'/api/order': {
				PUT: handle(async (req, ctx) => {
					requireEditor(ctx)
					const body = await readJson<{ folder?: string; order?: unknown }>(req)
					const folder = cleanPath(body.folder ?? '')
					if (!Array.isArray(body.order) || !body.order.every((n) => typeof n === 'string' && n && !n.includes('/'))) {
						throw new HttpError(400, '"order" must be a list of names')
					}
					await writeOrder(safeResolve(folder), body.order)
					broadcast({ type: 'tree.changed' })
					return json({ ok: true })
				}),
			},

			'/api/attachments': {
				POST: handle(async (req, ctx) => {
					requireEditor(ctx)
					const form = await req.formData().catch(() => {
						throw new HttpError(400, 'Expected multipart form data')
					})
					const docPath = cleanPath(requireString(form.get('docPath'), 'docPath'))
					const file = form.get('file')
					if (!(file instanceof File)) throw new HttpError(400, '"file" is required')
					if (file.size > config.maxUploadBytes) {
						throw new HttpError(413, `File is larger than ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB`)
					}

					const folder = safeResolve(joinPath(dirname(docPath), ATTACHMENTS_DIR))
					await mkdir(folder, { recursive: true })
					const name = await uniqueFileName(folder, sanitizeFileName(file.name))
					await Bun.write(join(folder, name), file)

					const response: AttachmentResponse = {
						relativePath: `${ATTACHMENTS_DIR}/${name}`,
						name,
						isImage: file.type.startsWith('image/'),
					}
					return json(response, { status: 201 })
				}),
			},

			'/api/users': {
				GET: handle(async (_, ctx) => {
					requireAdmin(ctx)
					const editors = listEditorIds()
					const users: HomedocsUser[] = (await listHaUsers()).filter(isPersonUser).map((u) => {
						const isAdmin = isHaAdmin(u)
						return {
							id: u.id,
							name: u.name,
							username: u.username,
							isAdmin,
							isOwner: u.is_owner,
							canEdit: isAdmin || editors.has(u.id),
						}
					})
					users.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name))
					return json(users)
				}),
			},

			'/api/users/:id': {
				PUT: handle(async (req: BunRequest<'/api/users/:id'>, ctx) => {
					const admin = requireAdmin(ctx)
					const body = await readJson<{ canEdit?: unknown }>(req)
					if (typeof body.canEdit !== 'boolean') throw new HttpError(400, '"canEdit" must be true or false')
					const user = (await listHaUsers()).find((u) => u.id === req.params.id)
					if (!user || !isPersonUser(user)) throw new HttpError(404, 'User not found')
					if (isHaAdmin(user)) throw new HttpError(400, 'Administrators can always edit')
					setEditor(user.id, body.canEdit, admin.id)
					return json({ ok: true })
				}),
			},

			'/api/shares': {
				GET: handle(async (req, ctx) => {
					requireAdmin(ctx)
					const path = new URL(req.url).searchParams.get('path')
					return json(await listShares(path === null ? undefined : cleanPath(path)))
				}),
				POST: handle(async (req, ctx) => {
					const admin = requireAdmin(ctx)
					const body = await readJson<{ path?: string }>(req)
					return json(await createShare(cleanPath(requireString(body.path, 'path')), admin), { status: 201 })
				}),
			},

			'/api/shares/:id': {
				PATCH: handle(async (req: BunRequest<'/api/shares/:id'>, ctx) => {
					requireAdmin(ctx)
					const body = await readJson<{ enabled?: unknown }>(req)
					if (typeof body.enabled !== 'boolean') throw new HttpError(400, '"enabled" must be true or false')
					if (!setShareEnabled(req.params.id, body.enabled)) throw new HttpError(404, 'Share link not found')
					return json({ ok: true })
				}),
				DELETE: handle(async (req: BunRequest<'/api/shares/:id'>, ctx) => {
					requireAdmin(ctx)
					deleteShare(req.params.id)
					return json({ ok: true })
				}),
			},

			'/api/settings/sharing': {
				GET: handle(async (_, ctx) => {
					requireAdmin(ctx)
					return json(await sharingSettings())
				}),
				PUT: handle(async (req, ctx) => {
					requireAdmin(ctx)
					const body = await readJson<{ remoteUrl?: unknown; force?: unknown }>(req)
					if (body.remoteUrl !== null && typeof body.remoteUrl !== 'string') {
						throw new HttpError(400, '"remoteUrl" must be a URL or null')
					}
					const remoteUrl = body.remoteUrl?.trim() || null
					// a URL that doesn't reach this app is only saved when the admin insists
					if (remoteUrl && body.force !== true) {
						const check = await checkBaseUrl(remoteUrl)
						if (!check.ok) throw new HttpError(422, check.message, { check })
					}
					setRemoteUrl(remoteUrl)
					return json(await sharingSettings())
				}),
			},

			'/api/settings/sharing/check': {
				POST: handle(async (req, ctx) => {
					requireAdmin(ctx)
					const body = await readJson<{ url?: string }>(req)
					return json(await checkBaseUrl(requireString(body.url, 'url')))
				}),
			},

			'/robots.txt': robotsResponse,

			'/files/*': {
				GET: handle(async (req) => {
					const pathname = new URL(req.url).pathname.slice('/files/'.length)
					return serveFile(safeResolve(decodeURIComponent(pathname)), { 'Cache-Control': 'no-cache' }, true)
				}),
			},

			'/ws': async (req: BunRequest, srv: Server<WsData>) => {
				try {
					const ctx = await resolver(req, srv)
					if (srv.upgrade(req, { data: { connId: crypto.randomUUID(), ctx } })) return undefined
					return new Response('Expected a websocket', { status: 400 })
				} catch (error) {
					return errorResponse(error)
				}
			},
		},

		/** Everything else is the frontend build. */
		fetch: async (req: Request, srv: Server<WsData>) => {
			try {
				await resolver(req, srv)
				const pathname = decodeURIComponent(new URL(req.url).pathname)
				if (pathname === '/' || pathname === '/index.html') {
					return await serveFile(join(config.webDir, 'index.html'), { 'Cache-Control': 'no-cache' }, false)
				}
				const absolutePath = normalize(join(config.webDir, pathname))
				if (!absolutePath.startsWith(config.webDir + sep)) throw new HttpError(404, 'Not found')
				const immutable = pathname.startsWith('/_app/immutable/')
				return await serveFile(
					absolutePath,
					{ 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' },
					false,
				)
			} catch (error) {
				return errorResponse(error)
			}
		},

		websocket: {
			idleTimeout: 120,
			open(ws) {
				sockets.set(ws.data.connId, ws)
				ws.subscribe(TOPIC)
				send(ws, { type: 'hello', connId: ws.data.connId })
				send(ws, { type: 'locks', locks: locks.snapshot() })
			},
			message(ws, raw) {
				let message: ClientMessage
				try {
					message = JSON.parse(String(raw))
				} catch {
					return
				}
				const { connId, ctx } = ws.data
				locks.touch(connId)

				if (message.type === 'ping') {
					send(ws, { type: 'pong' })
				} else if (message.type === 'lock.acquire') {
					if (!ctx.user || !ctx.canEdit || typeof message.path !== 'string') return
					const result = locks.acquire(message.path, connId, ctx.user)
					if (!result.ok) {
						send(ws, { type: 'lock.denied', path: message.path, holder: result.holder })
						return
					}
					if (result.replaced) {
						const previous = sockets.get(result.replaced.connId)
						if (previous) {
							send(previous, {
								type: 'lock.lost',
								path: message.path,
								holder: { userId: ctx.user.id, name: ctx.user.name, since: Date.now() },
							})
						}
					}
					send(ws, { type: 'lock.granted', path: message.path })
					broadcastLocks()
				} else if (message.type === 'lock.release') {
					if (locks.release(message.path, connId)) broadcastLocks()
				}
			},
			close(ws) {
				sockets.delete(ws.data.connId)
				if (locks.releaseConnection(ws.data.connId)) broadcastLocks()
			},
		},
	})

	const sweeper = setInterval(() => {
		if (locks.sweep()) broadcastLocks()
	}, 30_000)

	return {
		server,
		stop: () => {
			clearInterval(sweeper)
			server.stop(true)
		},
	}
}
