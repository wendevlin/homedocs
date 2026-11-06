import { beforeEach, describe, expect, test } from 'bun:test'
import { ORDER_FILE, type TreeNode } from '@homedocs/shared'
import { moveEntry } from '../src/entries'
import { buildTree } from '../src/tree'
import { setupDocs } from './helpers'

const titles = (nodes: TreeNode[]) => nodes.map((n) => n.title)

describe('buildTree', () => {
	beforeEach(() =>
		setupDocs({
			'index.md': '# Start',
			'zebra.md': '---\ntitle: Animals\n---\n# Zebra',
			'apple.md': '# Apple',
			'house/index.md': '---\ntitle: My House\n---\n',
			'house/heating.md': '',
			'garden/mower.md': '',
			'images/photo.png': 'png',
			'.git/config': '',
			'house/attachments/manual.pdf': 'pdf',
		}),
	)

	test('builds the navigation with titles, index pages and default order', async () => {
		const tree = await buildTree()
		expect(titles(tree)).toEqual(['Homedocs', 'Animals', 'apple', 'garden', 'My House'])

		const house = tree.find((n) => n.path === 'house')
		expect(house).toMatchObject({ type: 'folder', index: 'house/index.md', title: 'My House' })
		expect(house?.type === 'folder' && titles(house.children)).toEqual(['heating'])
	})

	test('skips folders without markdown and hidden entries', async () => {
		const paths = (await buildTree()).map((n) => n.path)
		expect(paths).not.toContain('images')
		expect(paths).not.toContain('.git')
	})

	test('applies the order file, unlisted entries follow', async () => {
		await setupDocs({
			'a.md': '',
			'b.md': '',
			'c.md': '',
			'folder/x.md': '',
			[ORDER_FILE]: JSON.stringify({ order: ['c.md', 'folder', 'missing.md'] }),
		})
		expect((await buildTree()).map((n) => n.name)).toEqual(['c.md', 'folder', 'a.md', 'b.md'])
	})

	test('moving an entry keeps the order files in sync', async () => {
		await setupDocs({
			'a.md': '',
			'b.md': '',
			'folder/x.md': '',
			[ORDER_FILE]: JSON.stringify({ order: ['b.md', 'a.md', 'folder'] }),
			[`folder/${ORDER_FILE}`]: JSON.stringify({ order: ['x.md'] }),
		})
		await moveEntry('b.md', 'renamed.md')
		expect((await buildTree()).map((n) => n.name)).toEqual(['renamed.md', 'a.md', 'folder'])

		await moveEntry('a.md', 'folder/a.md')
		const tree = await buildTree()
		expect(tree.map((n) => n.name)).toEqual(['renamed.md', 'folder'])
		const folder = tree[1]
		expect(folder?.type === 'folder' && folder.children.map((n) => n.name)).toEqual(['x.md', 'a.md'])
	})

	test('shows empty folders so new folders appear', async () => {
		await setupDocs({ 'a.md': '' })
		await moveEntry('a.md', 'new/a.md')
		await moveEntry('new/a.md', 'a.md')
		expect((await buildTree()).map((n) => n.name)).toEqual(['a.md', 'new'])
	})
})
