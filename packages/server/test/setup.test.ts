import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../src/config'
import { initDocs, readState } from '../src/setup'

const legacyRoot = join(config.dataDir, '..', 'legacy')
Object.assign(config, { legacyDocsRoot: legacyRoot })

const reset = async (legacyFiles: Record<string, string> = {}) => {
	for (const dir of [config.docsRoot, config.dataDir, legacyRoot]) await rm(dir, { recursive: true, force: true })
	for (const [path, content] of Object.entries(legacyFiles)) {
		await mkdir(join(legacyRoot, path, '..'), { recursive: true })
		await Bun.write(join(legacyRoot, path), content)
	}
}

describe('initDocs', () => {
	beforeEach(() => reset())

	test('copies the docs of Homedocs 3.x once and keeps the old folder', async () => {
		await reset({ 'index.md': '# Mine', 'house/heating.md': 'boiler' })
		expect(await initDocs()).toBe('migrated')
		expect(await Bun.file(join(config.docsRoot, 'house/heating.md')).text()).toBe('boiler')
		expect(await Bun.file(join(legacyRoot, 'house/heating.md')).exists()).toBe(true)
		expect((await readState()).migratedFrom).toBe(legacyRoot)

		// later starts never copy again, even if the user emptied the docs folder
		await rm(config.docsRoot, { recursive: true })
		expect(await initDocs()).toBe('existing')
		expect(await readdir(config.docsRoot)).toEqual([])
	})

	test('seeds the example docs on a fresh install', async () => {
		expect(await initDocs()).toBe('seeded')
		expect(await Bun.file(join(config.docsRoot, 'index.md')).exists()).toBe(true)
		expect((await readState()).migratedFrom).toBeUndefined()
	})

	test('keeps existing docs', async () => {
		await reset({ 'index.md': 'old' })
		await mkdir(config.docsRoot, { recursive: true })
		await Bun.write(join(config.docsRoot, 'mine.md'), 'new')
		expect(await initDocs()).toBe('existing')
		expect(await readdir(config.docsRoot)).toEqual(['mine.md'])
	})
})
