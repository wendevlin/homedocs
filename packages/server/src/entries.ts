import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { basename, joinPath, dirname as relativeDirname } from '@homedocs/shared'
import { HttpError } from './http'
import { rebaseLinks } from './links'
import { updateOrderEntry } from './order'
import { isMarkdown, safeResolve } from './paths'

const exists = async (absolutePath: string) => {
	try {
		await stat(absolutePath)
		return true
	} catch {
		return false
	}
}

export const createFolder = async (path: string) => {
	const absolutePath = safeResolve(path)
	if (absolutePath === safeResolve('')) throw new HttpError(400, 'Invalid folder')
	if (await exists(absolutePath)) throw new HttpError(409, 'A file or folder with this name already exists')
	await mkdir(absolutePath, { recursive: true })
}

/** Renames or moves a file or folder and keeps the order files of both folders in sync. */
export const moveEntry = async (from: string, to: string) => {
	const source = safeResolve(from)
	const target = safeResolve(to)
	const root = safeResolve('')
	if (source === root || target === root) throw new HttpError(400, 'Invalid path')
	if (!(await exists(source))) throw new HttpError(404, 'Not found')
	if (await exists(target)) throw new HttpError(409, 'A file or folder with this name already exists')
	if (target.startsWith(`${source}/`)) throw new HttpError(400, 'A folder cannot be moved into itself')

	const sourceStat = await stat(source)
	if (sourceStat.isFile() && isMarkdown(from) !== isMarkdown(to)) {
		throw new HttpError(400, 'Markdown files must keep the .md extension')
	}

	await mkdir(dirname(target), { recursive: true })
	await rename(source, target)
	await rebaseMovedDocs(from, to, sourceStat.isFile() ? [''] : await markdownFilesIn(target))

	const fromFolder = relativeDirname(from)
	const toFolder = relativeDirname(to)
	if (fromFolder === toFolder) {
		await updateOrderEntry(safeResolve(fromFolder), basename(from), basename(to))
	} else {
		await updateOrderEntry(safeResolve(fromFolder), basename(from), undefined)
		await updateOrderEntry(safeResolve(toFolder), undefined, basename(to))
	}
}

const markdownFilesIn = (absoluteFolder: string) => Array.fromAsync(new Bun.Glob('**/*.md').scan({ cwd: absoluteFolder }))

/**
 * Relative links (images, attachments, other pages) of moved documents are rewritten so they keep
 * pointing at the same files. Targets inside a moved folder moved along and are mapped accordingly.
 */
const rebaseMovedDocs = async (from: string, to: string, relativeDocs: string[]) => {
	const mapTarget = (path: string) => (path === from || path.startsWith(`${from}/`) ? to + path.slice(from.length) : path)
	for (const relativeDoc of relativeDocs) {
		const oldPath = joinPath(from, relativeDoc)
		const newPath = joinPath(to, relativeDoc)
		if (!isMarkdown(newPath)) continue
		const file = Bun.file(safeResolve(newPath))
		const content = await file.text()
		const rebased = rebaseLinks(content, relativeDirname(oldPath), relativeDirname(newPath), mapTarget)
		if (rebased !== content) await Bun.write(file, rebased)
	}
}

export const deleteEntry = async (path: string) => {
	const absolutePath = safeResolve(path)
	if (absolutePath === safeResolve('')) throw new HttpError(400, 'The docs folder cannot be deleted')
	if (!(await exists(absolutePath))) throw new HttpError(404, 'Not found')
	await rm(absolutePath, { recursive: true })
	await updateOrderEntry(safeResolve(relativeDirname(path)), basename(path), undefined)
}

/** Makes an uploaded file name safe to use on disk and in markdown links. */
export const sanitizeFileName = (name: string) => {
	const cleaned = basename(name.replaceAll('\\', '/'))
		.replaceAll('ß', 'ss')
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^[-.]+/, '')
		.replace(/-+(\.[^.]*)?$/, '$1')
	return cleaned || 'file'
}

/** `photo.png` → `photo-1.png`, `photo-2.png`, … until the name is free. */
export const uniqueFileName = async (absoluteFolder: string, name: string) => {
	const extension = extname(name)
	const stem = name.slice(0, name.length - extension.length)
	let candidate = name
	for (let i = 1; await exists(join(absoluteFolder, candidate)); i++) {
		candidate = `${stem}-${i}${extension}`
	}
	return candidate
}
