import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { basename, type DocResponse } from '@homedocs/shared'
import { frontMatterTitle } from './frontmatter'
import { HttpError } from './http'
import { isMarkdown, safeResolve } from './paths'

export const hashContent = (content: string | Uint8Array) => new Bun.CryptoHasher('sha256').update(content).digest('hex')

/** Hash of the file currently on disk, `null` if it does not exist. */
export const hashFile = async (absolutePath: string): Promise<string | null> => {
	const file = Bun.file(absolutePath)
	if (!(await file.exists())) return null
	return hashContent(await file.bytes())
}

const requireMarkdown = (path: string) => {
	if (!isMarkdown(path)) throw new HttpError(400, 'Only markdown files can be opened')
}

export const readDoc = async (path: string): Promise<DocResponse> => {
	requireMarkdown(path)
	const file = Bun.file(safeResolve(path))
	if (!(await file.exists())) throw new HttpError(404, 'Document not found')
	const content = await file.text()
	return {
		path,
		content,
		hash: hashContent(content),
		title: frontMatterTitle(content) ?? basename(path).replace(/\.md$/i, ''),
	}
}

export type WriteResult = { ok: true; hash: string } | { ok: false; currentHash: string | null }

/**
 * Writes a document unless it was changed on disk since the client loaded it (`baseHash`).
 * `force` overwrites regardless.
 */
export const writeDoc = async (path: string, content: string, baseHash: string | null, force = false): Promise<WriteResult> => {
	requireMarkdown(path)
	const absolutePath = safeResolve(path)
	const currentHash = await hashFile(absolutePath)
	if (!force && currentHash !== baseHash) return { ok: false, currentHash }
	await Bun.write(absolutePath, content)
	return { ok: true, hash: hashContent(content) }
}

export const createDoc = async (path: string, content: string) => {
	requireMarkdown(path)
	const absolutePath = safeResolve(path)
	if (await Bun.file(absolutePath).exists()) throw new HttpError(409, 'A file with this name already exists')
	await mkdir(dirname(absolutePath), { recursive: true })
	await Bun.write(absolutePath, content)
	return hashContent(content)
}
