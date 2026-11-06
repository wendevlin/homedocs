import { posix } from 'node:path'

const FENCED_CODE = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm
const MARKDOWN_LINK = /(\]\()(<[^>\n]*>|[^)\s]+)/g
const HTML_ATTRIBUTE = /(\b(?:src|href)=["'])([^"'\n]+)/g

const isRelative = (url: string) =>
	url !== '' && !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('#') && !url.startsWith('/')

const safeDecode = (value: string) => {
	try {
		return decodeURIComponent(value)
	} catch {
		return value
	}
}

/**
 * Rewrites one relative URL of a document that moves from `fromDir` to `toDir` so it still points
 * at the same target. `mapTarget` translates targets that moved as well (e.g. inside a moved folder).
 */
export const rebaseUrl = (url: string, fromDir: string, toDir: string, mapTarget: (path: string) => string = (p) => p) => {
	const bracketed = url.startsWith('<') && url.endsWith('>')
	const raw = bracketed ? url.slice(1, -1) : url
	if (!isRelative(raw)) return url

	const split = raw.search(/[?#]/)
	const path = split === -1 ? raw : raw.slice(0, split)
	const suffix = split === -1 ? '' : raw.slice(split)

	const target = posix.normalize(posix.join(fromDir || '.', safeDecode(path)))
	if (target.startsWith('..')) return url

	let relative = posix.relative(toDir || '.', mapTarget(target)) || '.'
	if (path.startsWith('./') && !relative.startsWith('.')) relative = `./${relative}`
	if (path.includes('%')) relative = encodeURI(relative)
	if (path.endsWith('/') && !relative.endsWith('/')) relative += '/'

	const result = relative + suffix
	return bracketed ? `<${result}>` : result
}

/** Rebases all relative links and images of a markdown document, leaving fenced code blocks untouched. */
export const rebaseLinks = (markdown: string, fromDir: string, toDir: string, mapTarget?: (path: string) => string) => {
	const rewrite = (text: string) =>
		text
			.replace(MARKDOWN_LINK, (_, prefix: string, url: string) => prefix + rebaseUrl(url, fromDir, toDir, mapTarget))
			.replace(HTML_ATTRIBUTE, (_, prefix: string, url: string) => prefix + rebaseUrl(url, fromDir, toDir, mapTarget))

	let result = ''
	let last = 0
	for (const match of markdown.matchAll(FENCED_CODE)) {
		result += rewrite(markdown.slice(last, match.index)) + match[0]
		last = match.index + match[0].length
	}
	return result + rewrite(markdown.slice(last))
}

const REFERENCE_DEFINITION = /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)/gm

/**
 * Docs-relative paths of every file a document links to or embeds (markdown links and images,
 * reference definitions, `src`/`href` attributes). Used to decide which files a share link may serve.
 */
export const referencedPaths = (markdown: string, dir: string): Set<string> => {
	const paths = new Set<string>()
	const add = (url: string) => {
		const raw = url.startsWith('<') && url.endsWith('>') ? url.slice(1, -1) : url
		// the viewer resolves `/…` from the docs root
		const rootRelative = raw.startsWith('/') && !raw.startsWith('//')
		if (!rootRelative && !isRelative(raw)) return
		const split = raw.search(/[?#]/)
		const path = split === -1 ? raw : raw.slice(0, split)
		const target = posix.normalize(posix.join(rootRelative ? '.' : dir || '.', safeDecode(path)))
		if (target === '.' || target.startsWith('..')) return
		paths.add(target)
	}
	for (const pattern of [MARKDOWN_LINK, HTML_ATTRIBUTE, REFERENCE_DEFINITION]) {
		for (const match of markdown.matchAll(pattern)) add(match[match.length - 1]!)
	}
	return paths
}
