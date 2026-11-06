import { beforeEach, describe, expect, test } from 'bun:test'
import { symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../src/config'
import { safeResolve } from '../src/paths'
import { setupDocs } from './helpers'

describe('safeResolve', () => {
	beforeEach(() => setupDocs({ 'a/b.md': '# b' }))

	test('resolves paths inside the docs root', () => {
		expect(safeResolve('a/b.md')).toBe(join(config.docsRoot, 'a/b.md'))
		expect(safeResolve('/a/b.md')).toBe(join(config.docsRoot, 'a/b.md'))
		expect(safeResolve('')).toBe(config.docsRoot)
		expect(safeResolve('new/folder/file.md')).toBe(join(config.docsRoot, 'new/folder/file.md'))
	})

	test.each(['../etc/passwd', 'a/../../x', 'a/./b.md', '.hidden', 'a/.git/config', 'a//b', 'a\0b'])(
		'rejects %p',
		(path) => {
			expect(() => safeResolve(path)).toThrow('Invalid path')
		},
	)

	test('rejects symlinks that lead outside the root', async () => {
		await symlink('/tmp', join(config.docsRoot, 'escape'))
		expect(() => safeResolve('escape/x.md')).toThrow('Invalid path')
	})
})
