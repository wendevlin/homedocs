import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { config } from '../src/config'
import { moveEntry } from '../src/entries'
import { rebaseLinks, rebaseUrl } from '../src/links'
import { setupDocs } from './helpers'

describe('rebaseUrl', () => {
	test('keeps relative targets when a document moves', () => {
		expect(rebaseUrl('attachments/a.pdf', '', 'garden')).toBe('../attachments/a.pdf')
		expect(rebaseUrl('./images/x.png', '', 'a/b')).toBe('../../images/x.png')
		expect(rebaseUrl('../files/s.pdf', 'Downloads', '')).toBe('files/s.pdf')
		expect(rebaseUrl('other.md#section', 'a', 'b')).toBe('../a/other.md#section')
		expect(rebaseUrl('<my file.pdf>', 'a', '')).toBe('<a/my file.pdf>')
		expect(rebaseUrl('my%20file.pdf', 'a', '')).toBe('a/my%20file.pdf')
	})

	test('leaves absolute, external and anchor links alone', () => {
		for (const url of ['https://example.com', 'mailto:me@example.com', '#top', '/abs', 'data:image/png;base64,x']) {
			expect(rebaseUrl(url, 'a', 'b')).toBe(url)
		}
	})
})

describe('rebaseLinks', () => {
	test('rewrites markdown and html links but not code blocks', () => {
		const markdown = [
			'![photo](images/a.png) and [manual](attachments/m.pdf "Manual")',
			'<a href="files/s.pdf" download>here</a>',
			'```markdown',
			'[example](images/a.png)',
			'```',
			'[external](https://example.com)',
		].join('\n')
		expect(rebaseLinks(markdown, '', 'garden')).toBe(
			[
				'![photo](../images/a.png) and [manual](../attachments/m.pdf "Manual")',
				'<a href="../files/s.pdf" download>here</a>',
				'```markdown',
				'[example](images/a.png)',
				'```',
				'[external](https://example.com)',
			].join('\n'),
		)
	})
})

describe('moving documents keeps their links working', () => {
	test('moving a file into a folder', async () => {
		await setupDocs({ 'heating.md': '![](attachments/boiler.png) [x](other.md)', 'attachments/boiler.png': '', 'other.md': '', 'garden/a.md': '' })
		await moveEntry('heating.md', 'garden/heating.md')
		expect(await Bun.file(join(config.docsRoot, 'garden/heating.md')).text()).toBe('![](../attachments/boiler.png) [x](../other.md)')
	})

	test('moving a folder keeps links inside the folder and fixes links out of it', async () => {
		await setupDocs({
			'house/heating.md': '![](attachments/boiler.png) [up](../index.md)',
			'house/attachments/boiler.png': '',
			'index.md': '',
		})
		await moveEntry('house', 'places/house')
		expect(await Bun.file(join(config.docsRoot, 'places/house/heating.md')).text()).toBe(
			'![](attachments/boiler.png) [up](../../index.md)',
		)
	})

	test('files without changed links are not rewritten', async () => {
		await setupDocs({ 'a.md': 'no links', 'b/c.md': '' })
		await moveEntry('a.md', 'b/a.md')
		expect(await Bun.file(join(config.docsRoot, 'b/a.md')).text()).toBe('no links')
	})
})
