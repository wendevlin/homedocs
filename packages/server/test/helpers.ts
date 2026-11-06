import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { config } from '../src/config'

/** Replaces the docs root with the given files (path → content). */
export const setupDocs = async (files: Record<string, string>) => {
	await rm(config.docsRoot, { recursive: true, force: true })
	await mkdir(config.docsRoot, { recursive: true })
	for (const [path, content] of Object.entries(files)) {
		await mkdir(dirname(join(config.docsRoot, path)), { recursive: true })
		await Bun.write(join(config.docsRoot, path), content)
	}
}
