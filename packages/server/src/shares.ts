import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { type ShareLink, type SharingCheckResult, type SharingSettings, shareType, type TreeFolder, type TreeNode } from '@homedocs/shared'
import { config } from './config'
import {
	deleteShareRowById,
	getSetting,
	insertShareRow,
	listShareRows,
	type ShareRow,
	setSetting,
	setSharePath,
} from './db'
import { readDoc } from './docs'
import { HttpError } from './http'
import { isMarkdown } from './paths'
import { buildTree } from './tree'

/**
 * Share links are `<id>.<signature>`. The id is random and stored in the database (so a link can be
 * disabled or removed), the signature is an HMAC of the id with a secret that never leaves `/data`.
 * Tokens with a wrong signature are rejected before the database is touched.
 */

const ID_BYTES = 12
const SIGNATURE_BYTES = 16
const TOKEN = /^([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22})$/

let secret: Buffer | null = null
const shareSecret = () => {
	if (secret) return secret
	let stored = getSetting('share_secret')
	if (!stored) {
		stored = randomBytes(32).toString('base64url')
		setSetting('share_secret', stored)
	}
	secret = Buffer.from(stored, 'base64url')
	return secret
}

const hmac = (value: string) => createHmac('sha256', shareSecret()).update(value).digest()

const sign = (id: string) => hmac(`share:${id}`).subarray(0, SIGNATURE_BYTES)

export const tokenFor = (id: string) => `${id}.${sign(id).toString('base64url')}`

/** The share id of a correctly signed token, otherwise `null`. Does not check whether the share exists. */
export const verifyToken = (token: string): string | null => {
	const match = TOKEN.exec(token)
	if (!match) return null
	const [, id, signature] = match as unknown as [string, string, string]
	const given = Buffer.from(signature, 'base64url')
	const expected = sign(id)
	return given.length === expected.length && timingSafeEqual(given, expected) ? id : null
}

/**
 * Identifies this installation without revealing anything: lets the remote URL check tell whether
 * the URL really reaches this app and not something else.
 */
export const instanceId = () => hmac('instance').subarray(0, 12).toString('base64url')

const findFolder = (nodes: TreeNode[], path: string): TreeFolder | null => {
	for (const node of nodes) {
		if (node.type !== 'folder') continue
		if (node.path === path) return node
		if (path.startsWith(`${node.path}/`)) return findFolder(node.children, path)
	}
	return null
}

/** A shared folder as it is shown in the navigation, `null` if it doesn't exist (anymore). */
export const sharedFolder = async (path: string) => findFolder(await buildTree(), path)

/** The first page of a folder in navigation order. */
export const firstDoc = (folder: TreeFolder): string | null => {
	if (folder.index) return folder.index
	for (const node of folder.children) {
		const doc = node.type === 'file' ? node.path : firstDoc(node)
		if (doc) return doc
	}
	return null
}

/** Whether a page may be opened through a share link of `sharedPath`. */
export const isSharedDoc = (sharedPath: string, docPath: string) =>
	shareType(sharedPath) === 'page' ? docPath === sharedPath : isMarkdown(docPath) && docPath.startsWith(`${sharedPath}/`)

const shareTitle = async (path: string) =>
	shareType(path) === 'page'
		? readDoc(path).then(
				(doc) => doc.title,
				() => null,
			)
		: ((await sharedFolder(path))?.title ?? null)

const toShareLink = async (row: ShareRow): Promise<ShareLink> => ({
	id: row.id,
	type: shareType(row.path),
	token: tokenFor(row.id),
	path: row.path,
	title: await shareTitle(row.path),
	enabled: row.enabled === 1,
	createdBy: row.created_by_name,
	createdAt: row.created_at,
	lastOpenedAt: row.last_opened_at,
	openCount: row.open_count,
})

export const listShares = async (path?: string) =>
	Promise.all(
		listShareRows()
			.filter((row) => path === undefined || row.path === path)
			.map(toShareLink),
	)

export const createShare = async (path: string, by: { id: string; name: string }) => {
	// only existing pages and folders can be shared
	if (shareType(path) === 'page') await readDoc(path)
	else if (!(await sharedFolder(path))) throw new HttpError(404, 'Folder not found')
	const id = randomBytes(ID_BYTES).toString('base64url')
	insertShareRow(id, path, by)
	return toShareLink(listShareRows().find((row) => row.id === id)!)
}

export const deleteShare = (id: string) => {
	if (!deleteShareRowById(id)) throw new HttpError(404, 'Share link not found')
}

const isInside = (path: string, entry: string) => path === entry || path.startsWith(`${entry}/`)

/** Share links follow their page when it (or a folder above it) is renamed or moved. */
export const moveShares = (from: string, to: string) => {
	for (const row of listShareRows()) {
		if (isInside(row.path, from)) setSharePath(row.id, to + row.path.slice(from.length))
	}
}

/**
 * Removing a page removes its share links, so a QR code printed for it never opens a different page
 * that is created later under the same name.
 */
export const deleteSharesInside = (path: string) => {
	for (const row of listShareRows()) {
		if (isInside(row.path, path)) deleteShareRowById(row.id)
	}
}

// ---- settings ----

/** Checks and normalizes a base URL entered by an admin: `https://docs.example.com/homedocs/` → `https://docs.example.com/homedocs` */
export const normalizeBaseUrl = (input: string): string => {
	let url: URL
	try {
		url = new URL(input.trim())
	} catch {
		throw new HttpError(400, 'Enter a full URL, e.g. https://docs.example.com')
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError(400, 'The URL must start with http:// or https://')
	if (url.username || url.password || url.search || url.hash) {
		throw new HttpError(400, 'The URL must not contain a login, query or #fragment')
	}
	return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

export const getRemoteUrl = () => getSetting('share_remote_url')

export const setRemoteUrl = (input: string | null) => {
	setSetting('share_remote_url', input ? normalizeBaseUrl(input) : null)
}

type SupervisorResponse<T> = { result: string; data: T }

const supervisor = async <T>(path: string): Promise<T> => {
	const response = await fetch(`${config.supervisorUrl}${path}`, {
		headers: { Authorization: `Bearer ${config.supervisorToken}` },
		signal: AbortSignal.timeout(5000),
	})
	if (!response.ok) throw new Error(`Supervisor ${path}: ${response.status}`)
	return ((await response.json()) as SupervisorResponse<T>).data
}

type LocalUrl = { url: string | null; problem: string | null }
let localUrlCache: { value: LocalUrl; at: number } | null = null

/**
 * The share listener's address in the local network: the host's primary IP address and the host
 * port the share port is mapped to. Both come from the Supervisor (needs `hassio_api: true`).
 */
const detectLocalUrl = async (): Promise<LocalUrl> => {
	if (!config.supervisorToken) return { url: null, problem: null }
	if (localUrlCache && Date.now() - localUrlCache.at < 60_000) return localUrlCache.value
	let value: LocalUrl
	try {
		const [self, network] = await Promise.all([
			supervisor<{ network: Record<string, number | null> | null }>('/addons/self/info'),
			supervisor<{ interfaces: { primary: boolean; ipv4?: { address?: string[] } }[] }>('/network/info'),
		])
		const hostPort = self.network?.[`${config.sharePort}/tcp`]
		const ip = (network.interfaces.find((i) => i.primary) ?? network.interfaces[0])?.ipv4?.address?.[0]?.split('/')[0]
		if (!hostPort) {
			value = { url: null, problem: `The share port ${config.sharePort} is disabled in the app's network settings.` }
		} else if (!ip) {
			value = { url: null, problem: 'The IP address of Home Assistant could not be found.' }
		} else {
			value = { url: `http://${ip}:${hostPort}`, problem: null }
		}
	} catch (error) {
		console.error('Could not detect the local share URL', error)
		value = { url: null, problem: 'The local address could not be detected.' }
	}
	localUrlCache = { value, at: Date.now() }
	return value
}

export const sharingSettings = async (): Promise<SharingSettings> => {
	const local = await detectLocalUrl()
	return {
		port: config.sharePort,
		localUrl: local.url,
		localUrlProblem: local.problem,
		remoteUrl: getRemoteUrl(),
	}
}

export const CHECK_PATH = '/.well-known/homedocs-share'

/** Asks the share listener behind `base` who it is, to make sure the URL reaches this app. */
export const checkBaseUrl = async (base: string): Promise<SharingCheckResult> => {
	const url = `${normalizeBaseUrl(base)}${CHECK_PATH}`
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } })
		if (!response.ok) return { ok: false, message: `${url} answered with HTTP ${response.status}.` }
		const body = (await response.json().catch(() => null)) as { instance?: string } | null
		if (body?.instance === instanceId()) return { ok: true, message: 'Share links work through this URL.' }
		if (body?.instance) return { ok: false, message: 'This URL reaches a different Homedocs installation.' }
		return { ok: false, message: 'This URL does not reach the Homedocs share port.' }
	} catch (error) {
		const reason = error instanceof Error && error.name === 'TimeoutError' ? 'it did not answer in time' : 'it could not be reached'
		return {
			ok: false,
			message: `Homedocs could not open ${url}, ${reason}.`,
		}
	}
}
