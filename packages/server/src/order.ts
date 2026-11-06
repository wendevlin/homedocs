import { join } from 'node:path'
import { ORDER_FILE } from '@homedocs/shared'

/** Reads the custom order of a folder's entries (file and folder names). */
export const readOrder = async (absoluteFolder: string): Promise<string[]> => {
	const file = Bun.file(join(absoluteFolder, ORDER_FILE))
	if (!(await file.exists())) return []
	try {
		const data = (await file.json()) as { order?: unknown }
		return Array.isArray(data.order) ? data.order.filter((n): n is string => typeof n === 'string') : []
	} catch {
		return []
	}
}

export const writeOrder = async (absoluteFolder: string, order: string[]) => {
	await Bun.write(join(absoluteFolder, ORDER_FILE), `${JSON.stringify({ order }, null, '\t')}\n`)
}

/** Updates a folder's order after an entry was renamed, moved out (`to` undefined) or moved in (`from` undefined). */
export const updateOrderEntry = async (absoluteFolder: string, from?: string, to?: string) => {
	const order = await readOrder(absoluteFolder)
	if (order.length === 0) return
	const index = from ? order.indexOf(from) : -1
	if (index !== -1) {
		if (to) order[index] = to
		else order.splice(index, 1)
	} else if (to) {
		order.push(to)
	} else {
		return
	}
	await writeOrder(absoluteFolder, order)
}

/** Sorts entries: custom order first, then index files, then alphabetically by title. */
export const sortEntries = <T extends { name: string; title: string }>(entries: T[], order: string[]): T[] => {
	const position = new Map(order.map((name, i) => [name, i]))
	return entries.toSorted((a, b) => {
		const pa = position.get(a.name)
		const pb = position.get(b.name)
		if (pa !== undefined && pb !== undefined) return pa - pb
		if (pa !== undefined) return -1
		if (pb !== undefined) return 1
		const ia = a.name.toLowerCase() === 'index.md'
		const ib = b.name.toLowerCase() === 'index.md'
		if (ia !== ib) return ia ? -1 : 1
		return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true })
	})
}
