import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { joinPath, type TreeFolder, type TreeNode } from '@homedocs/shared'
import { config } from './config'
import { frontMatterTitle } from './frontmatter'
import { readOrder, sortEntries } from './order'

/** Front matter is at the top, so reading the beginning of a file is enough to find the title. */
const readTitle = async (absolutePath: string, fallback: string) => {
	const head = await Bun.file(absolutePath).slice(0, 8192).text()
	return frontMatterTitle(head) ?? fallback
}

const stripExtension = (name: string) => name.replace(/\.md$/i, '')

/**
 * Scans a folder recursively. Shown are markdown files and folders that contain markdown files
 * (or are completely empty, so newly created folders appear). Hidden entries are skipped.
 */
const scanFolder = async (absoluteFolder: string, relativeFolder: string): Promise<TreeNode[] | null> => {
	const entries = await readdir(absoluteFolder, { withFileTypes: true })
	if (entries.length === 0) return []

	const nodes: TreeNode[] = []
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue
		const relativePath = joinPath(relativeFolder, entry.name)
		const absolutePath = join(absoluteFolder, entry.name)

		if (entry.isDirectory()) {
			const children = await scanFolder(absolutePath, relativePath)
			if (children === null) continue
			const folder: TreeFolder = {
				type: 'folder',
				name: entry.name,
				path: relativePath,
				title: entry.name,
				children,
			}
			const indexNode = children.find((c) => c.type === 'file' && c.name.toLowerCase() === 'index.md')
			if (indexNode) {
				folder.index = indexNode.path
				folder.children = children.filter((c) => c !== indexNode)
				if (indexNode.title !== 'index') folder.title = indexNode.title
			}
			nodes.push(folder)
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
			const isRootIndex = relativeFolder === '' && entry.name.toLowerCase() === 'index.md'
			nodes.push({
				type: 'file',
				name: entry.name,
				path: relativePath,
				title: await readTitle(absolutePath, isRootIndex ? 'Homedocs' : stripExtension(entry.name)),
			})
		}
	}

	// folders without any markdown (e.g. only images) are not part of the navigation
	if (nodes.length === 0) return null

	return sortEntries(nodes, await readOrder(absoluteFolder))
}

export const buildTree = async (root = config.docsRoot): Promise<TreeNode[]> => (await scanFolder(root, '')) ?? []
