import { join, normalize, posix, sep } from 'node:path'
import type { BunRequest } from 'bun'
import { dirname, type ShareInfo, type SharedDocResponse, shareType } from '@homedocs/shared'
import { config } from './config'
import { getShareRow, markShareOpened } from './db'
import { readDoc } from './docs'
import { robotsResponse, serveFile } from './files'
import { errorResponse, HttpError, json } from './http'
import { referencedPaths } from './links'
import { cleanPath, isMarkdown, safeResolve } from './paths'
import { CHECK_PATH, firstDoc, instanceId, isSharedDoc, sharedFolder, verifyToken } from './shares'

/**
 * The share listener. It runs on its own port that is reachable without Home Assistant, so it serves
 * nothing but the frontend and the pages (plus the files they reference) of enabled share links.
 * No user, no tree, no editing, no websocket.
 */

/** Sent with every response: never index, never leak the share URL to linked sites, never frame. */
const SECURITY_HEADERS = {
	'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, noimageindex',
	'Referrer-Policy': 'no-referrer',
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
}

const NOT_FOUND = 'This link is not valid (anymore).'

const withSecurityHeaders = (response: Response) => {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value)
	return response
}

const handle =
	<R extends Request>(fn: (req: R) => Response | Promise<Response>) =>
	async (req: R): Promise<Response> => {
		try {
			return withSecurityHeaders(await fn(req))
		} catch (error) {
			return withSecurityHeaders(errorResponse(error))
		}
	}

/** The share row of an enabled share link. Unknown, badly signed and disabled links look the same. */
const resolveShare = (token: string) => {
	const id = verifyToken(token)
	const row = id ? getShareRow(id) : null
	if (!row?.enabled) throw new HttpError(404, NOT_FOUND)
	return row
}

/** A page of the share link: the shared page itself, or any page inside the shared folder. */
const readSharedDoc = async (sharedPath: string, requested: string | null) => {
	let path: string
	try {
		path = requested === null ? sharedPath : cleanPath(requested)
	} catch {
		throw new HttpError(404, 'Page not found')
	}
	if (!isSharedDoc(sharedPath, path)) throw new HttpError(404, 'Page not found')
	return readDoc(path).catch(() => Promise.reject(new HttpError(404, 'Page not found')))
}

/** The frontend, marked so it knows it only shows shared pages. */
const serveIndex = async () => {
	const html = await Bun.file(join(config.webDir, 'index.html')).text()
	return new Response(html.replace('<head>', '<head>\n\t\t<meta name="homedocs-share" content="1" />'), {
		headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
	})
}

export const createShareServer = ({ port }: { port: number }) =>
	Bun.serve({
		port,
		hostname: '0.0.0.0',

		routes: {
			'/robots.txt': handle(robotsResponse),

			[CHECK_PATH]: handle(() => json({ instance: instanceId() }, { headers: { 'Cache-Control': 'no-store' } })),

			/** The URL in QR codes. Redirects into the hash route, relative so it works behind a path prefix. */
			'/s/:token': handle((req: BunRequest<'/s/:token'>) => {
				if (!verifyToken(req.params.token)) throw new HttpError(404, NOT_FOUND)
				return new Response(null, {
					status: 302,
					headers: { Location: `../#/s/${req.params.token}`, 'Cache-Control': 'no-store' },
				})
			}),

			/** What the link shares: a page, or a folder with its navigation. Counts as one visit. */
			'/api/share/:token': handle(async (req: BunRequest<'/api/share/:token'>) => {
				const row = resolveShare(req.params.token)
				let info: ShareInfo
				if (shareType(row.path) === 'page') {
					const doc = await readSharedDoc(row.path, null).catch(() => Promise.reject(new HttpError(404, NOT_FOUND)))
					info = { type: 'page', title: doc.title, folder: null, home: doc.path }
				} else {
					const folder = await sharedFolder(row.path)
					if (!folder) throw new HttpError(404, NOT_FOUND)
					info = { type: 'folder', title: folder.title, folder, home: firstDoc(folder) }
				}
				markShareOpened(row.id)
				return json(info, { headers: { 'Cache-Control': 'no-store' } })
			}),

			/** `?path=` a page of the share link; for a page link it defaults to the page. */
			'/api/share/:token/doc': handle(async (req: BunRequest<'/api/share/:token/doc'>) => {
				const row = resolveShare(req.params.token)
				const doc = await readSharedDoc(row.path, new URL(req.url).searchParams.get('path'))
				const response: SharedDocResponse = { path: doc.path, title: doc.title, content: doc.content }
				return json(response, { headers: { 'Cache-Control': 'no-store' } })
			}),

			/**
			 * `/share-files/<token>/<path>?doc=<page>`: only files that a page of the share link (`doc`)
			 * links to or embeds, never pages.
			 */
			'/share-files/*': handle(async (req) => {
				const url = new URL(req.url)
				const [token = '', ...rest] = url.pathname.slice('/share-files/'.length).split('/')
				const row = resolveShare(token)
				const doc = await readSharedDoc(row.path, url.searchParams.get('doc'))
				let path: string
				try {
					path = posix.normalize(rest.map(decodeURIComponent).join('/'))
				} catch {
					throw new HttpError(400, 'Invalid path')
				}
				if (isMarkdown(path) || !referencedPaths(doc.content, dirname(doc.path)).has(path)) {
					throw new HttpError(404, 'Not found')
				}
				return serveFile(safeResolve(path), { 'Cache-Control': 'private, no-cache' }, true)
			}),
		},

		/** Only the frontend build: the entry page and its assets. */
		fetch: handle(async (req) => {
			if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed')
			const pathname = decodeURIComponent(new URL(req.url).pathname)
			if (pathname === '/' || pathname === '/index.html') return serveIndex()
			if (!pathname.startsWith('/_app/') && pathname !== '/favicon.svg') throw new HttpError(404, 'Not found')
			const absolutePath = normalize(join(config.webDir, pathname))
			if (!absolutePath.startsWith(config.webDir + sep)) throw new HttpError(404, 'Not found')
			const immutable = pathname.startsWith('/_app/immutable/')
			return serveFile(absolutePath, { 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' }, false)
		}),
	})
