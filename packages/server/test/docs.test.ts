import { beforeEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { config } from '../src/config'
import { createDoc, hashContent, readDoc, writeDoc } from '../src/docs'
import { sanitizeFileName, uniqueFileName } from '../src/entries'
import { setupDocs } from './helpers'

describe('documents', () => {
	beforeEach(() => setupDocs({ 'doc.md': '---\ntitle: Doc\n---\nhello', 'files/a.png': '' }))

	test('reads content, title and hash', async () => {
		const doc = await readDoc('doc.md')
		expect(doc.title).toBe('Doc')
		expect(doc.hash).toBe(hashContent('---\ntitle: Doc\n---\nhello'))
	})

	test('only markdown files can be read', async () => {
		expect(readDoc('files/a.png')).rejects.toThrow('Only markdown')
	})

	test('saves when the file is unchanged on disk', async () => {
		const { hash } = await readDoc('doc.md')
		const result = await writeDoc('doc.md', 'new', hash)
		expect(result).toEqual({ ok: true, hash: hashContent('new') })
		expect(await Bun.file(join(config.docsRoot, 'doc.md')).text()).toBe('new')
	})

	test('reports a conflict when the file changed on disk, force overwrites', async () => {
		const { hash } = await readDoc('doc.md')
		await Bun.write(join(config.docsRoot, 'doc.md'), 'changed outside')

		const conflict = await writeDoc('doc.md', 'mine', hash)
		expect(conflict).toEqual({ ok: false, currentHash: hashContent('changed outside') })
		expect(await Bun.file(join(config.docsRoot, 'doc.md')).text()).toBe('changed outside')

		expect((await writeDoc('doc.md', 'mine', hash, true)).ok).toBe(true)
		expect(await Bun.file(join(config.docsRoot, 'doc.md')).text()).toBe('mine')
	})

	test('a deleted file is a conflict too', async () => {
		const { hash } = await readDoc('doc.md')
		await Bun.file(join(config.docsRoot, 'doc.md')).delete()
		expect(await writeDoc('doc.md', 'mine', hash)).toEqual({ ok: false, currentHash: null })
	})

	test('creating an existing doc fails', async () => {
		expect(createDoc('doc.md', '')).rejects.toThrow('already exists')
		await createDoc('sub/new.md', '# New')
		expect((await readDoc('sub/new.md')).content).toBe('# New')
	})
})

describe('attachment names', () => {
	test('sanitizes uploaded file names', () => {
		expect(sanitizeFileName('Bedienungsanleitung Heizung (2024).pdf')).toBe('Bedienungsanleitung-Heizung-2024.pdf')
		expect(sanitizeFileName('../../etc/passwd')).toBe('passwd')
		expect(sanitizeFileName('.htaccess')).toBe('htaccess')
		expect(sanitizeFileName('Größe.png')).toBe('Grosse.png')
		expect(sanitizeFileName('???')).toBe('file')
	})

	test('finds a free name', async () => {
		await setupDocs({ 'a/photo.png': '', 'a/photo-1.png': '' })
		expect(await uniqueFileName(join(config.docsRoot, 'a'), 'photo.png')).toBe('photo-2.png')
		expect(await uniqueFileName(join(config.docsRoot, 'a'), 'other.png')).toBe('other.png')
	})
})
