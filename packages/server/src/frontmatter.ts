const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export const parseFrontMatter = (markdown: string): Record<string, unknown> => {
	const match = FRONT_MATTER.exec(markdown)
	if (!match) return {}
	try {
		const data = Bun.YAML.parse(match[1] ?? '')
		return data && typeof data === 'object' && !Array.isArray(data)
			? (data as Record<string, unknown>)
			: {}
	} catch {
		return {}
	}
}

export const frontMatterTitle = (markdown: string): string | undefined => {
	const title = parseFrontMatter(markdown).title
	return typeof title === 'string' && title.trim() ? title.trim() : undefined
}
