/** A markdown file or a folder in the docs tree. Paths are relative to the docs root and use `/`. */
export type TreeNode = TreeFile | TreeFolder

export type TreeFile = {
	type: 'file'
	/** File name on disk, e.g. `heating.md` */
	name: string
	/** e.g. `house/heating.md` */
	path: string
	title: string
}

export type TreeFolder = {
	type: 'folder'
	name: string
	/** e.g. `house` */
	path: string
	title: string
	/** Path of the folder's `index.md`, if it has one; the folder is then a clickable page */
	index?: string
	children: TreeNode[]
}

export type DocResponse = {
	path: string
	title: string
	content: string
	hash: string
}

export type Me = {
	id: string | null
	name: string | null
	isAdmin: boolean
	canEdit: boolean
	/** Shown to admins once after the docs were moved from the Home Assistant config folder */
	migrationNotice?: { docsPath: string }
}

export type HomedocsUser = {
	id: string
	name: string
	username: string | null
	isAdmin: boolean
	isOwner: boolean
	canEdit: boolean
}

export type LockInfo = {
	userId: string
	name: string
	since: number
}

export type SaveDocRequest = {
	path: string
	content: string
	baseHash: string | null
	force?: boolean
}

export type SaveConflict = {
	error: 'conflict'
	currentHash: string | null
}

export type AttachmentResponse = {
	/** Path relative to the document's folder, ready to be used in markdown */
	relativePath: string
	name: string
	isImage: boolean
}

/** A signed link that opens one page without logging in to Home Assistant. */
export type ShareLink = {
	id: string
	/** A single page, or a folder with all pages in it (and in its subfolders) */
	type: ShareType
	/** Signed token used in the URL: `<base>/s/<token>` */
	token: string
	path: string
	/** Title of the page or folder, `null` if it no longer exists */
	title: string | null
	enabled: boolean
	createdBy: string
	createdAt: number
	lastOpenedAt: number | null
	openCount: number
}

export type SharingSettings = {
	/** Port the share listener runs on inside the app */
	port: number
	/** Base URL in the local network, `null` if it could not be detected */
	localUrl: string | null
	/** Why `localUrl` is missing, e.g. the port is disabled in the app's network settings */
	localUrlProblem: string | null
	/** Base URL from outside, e.g. through a reverse proxy; set by an admin */
	remoteUrl: string | null
}

export type SharingCheckResult = {
	ok: boolean
	message: string
}

export type ShareType = 'page' | 'folder'

/** Pages are markdown files, everything else that can be shared is a folder. */
export const shareType = (path: string): ShareType => (/\.md$/i.test(path) ? 'page' : 'folder')

/** What the share listener returns for a valid share link. */
export type ShareInfo = {
	type: ShareType
	title: string
	/** The shared folder (paths relative to the docs root), `null` for a page */
	folder: TreeFolder | null
	/** The page shown first: the shared page, or the folder's index or first page */
	home: string | null
}

/** A page of a share link. */
export type SharedDocResponse = {
	path: string
	title: string
	content: string
}

/** `<base>/s/<token>`, the URL that is put in QR codes. */
export const shareUrl = (base: string, token: string) => `${base.replace(/\/+$/, '')}/s/${token}`

export type ClientMessage =
	| { type: 'lock.acquire'; path: string }
	| { type: 'lock.release'; path: string }
	| { type: 'ping' }

export type ServerMessage =
	| { type: 'hello'; connId: string }
	| { type: 'locks'; locks: Record<string, LockInfo> }
	| { type: 'lock.granted'; path: string }
	| { type: 'lock.denied'; path: string; holder: LockInfo }
	| { type: 'lock.lost'; path: string; holder: LockInfo }
	| { type: 'tree.changed' }
	| { type: 'doc.saved'; path: string; hash: string; by: string }
	| { type: 'doc.moved'; from: string; to: string; by: string }
	| { type: 'doc.deleted'; path: string; by: string }
	| { type: 'pong' }

export const ORDER_FILE = '.homedocs-order.json'
export const ATTACHMENTS_DIR = 'attachments'

/** `house/heating.md` → `house/heating`, `house/index.md` → `house`, `index.md` → `` */
export const fileToRoute = (path: string): string => {
	const withoutExt = path.replace(/\.md$/i, '')
	if (withoutExt === 'index') return ''
	return withoutExt.replace(/\/index$/i, '')
}

/** Parent folder of a path, `` for top level entries */
export const dirname = (path: string): string => {
	const i = path.lastIndexOf('/')
	return i === -1 ? '' : path.slice(0, i)
}

export const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

export const joinPath = (...parts: string[]): string => parts.filter(Boolean).join('/')
