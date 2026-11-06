import { realpathSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import { config } from './config'
import { HttpError } from './http'

/**
 * Resolves a docs-relative path to an absolute path inside the docs root.
 * Rejects traversal, absolute paths, hidden segments and symlinks that point outside the root.
 */
export const safeResolve = (relativePath: string, root = config.docsRoot): string => {
	if (relativePath.includes('\0')) throw new HttpError(400, 'Invalid path')

	const cleaned = relativePath.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
	if (cleaned === '') return root

	const segments = cleaned.split('/')
	for (const segment of segments) {
		if (segment === '' || segment === '.' || segment === '..' || segment.startsWith('.')) {
			throw new HttpError(400, 'Invalid path')
		}
	}

	const absolute = normalize(join(root, ...segments))
	if (!absolute.startsWith(root + sep)) throw new HttpError(400, 'Invalid path')

	// the closest existing ancestor must not be a symlink that leads out of the root
	const realRoot = realpathSync(root)
	let existing = absolute
	for (;;) {
		try {
			const real = realpathSync(existing)
			if (real !== realRoot && !real.startsWith(realRoot + sep)) {
				throw new HttpError(400, 'Invalid path')
			}
			break
		} catch (error) {
			if (error instanceof HttpError) throw error
			const parent = dirname(existing)
			if (parent === existing) break
			existing = parent
		}
	}

	return absolute
}

/** Normalizes a docs-relative path (no leading/trailing slashes, forward slashes) after validating it. */
export const cleanPath = (relativePath: string): string => {
	safeResolve(relativePath)
	return relativePath.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
}

export const isMarkdown = (path: string) => path.toLowerCase().endsWith('.md')
