import type { Element, Root } from 'hast';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGemoji from 'remark-gemoji';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { fileUrl, shareFileUrl } from './api';
import { docFolder, docHref, isExternalUrl, resolveRelative, sharedDocHref } from './paths';

type LinkOptions = {
	/** Document being rendered, links are relative to its folder */
	docPath: string;
	/** Whether a docs-relative path is a markdown document (for shared pages: one the link opens) */
	isDoc: (path: string) => boolean;
	/**
	 * Token of the share link the page was opened with. Links to pages the share link doesn't
	 * include are not clickable, files are loaded through the share listener.
	 */
	shareToken?: string;
};

const splitSuffix = (url: string) => {
	const index = url.search(/[?#]/);
	return index === -1 ? [url, ''] : [url.slice(0, index), url.slice(index)];
};

const safeDecode = (value: string) => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

/** Finds the document a link like `../heating`, `./file.md` or `../Downloads` points to. */
const findDoc = (path: string, isDoc: LinkOptions['isDoc']) => {
	const candidates = /\.md$/i.test(path)
		? [path]
		: [`${path}.md`, path ? `${path}/index.md` : 'index.md'];
	return candidates.find(isDoc) ?? null;
};

/** Points relative links to documents (hash routes) and files (`files/…`), opens external links in a new tab. */
const rehypeHomedocsLinks = ({ docPath, isDoc, shareToken }: LinkOptions) => {
	const folder = docFolder(docPath);
	const toFileUrl = (path: string) =>
		shareToken ? shareFileUrl(shareToken, path, docPath) : fileUrl(path);
	const toDocHref = (path: string) => (shareToken ? sharedDocHref(shareToken, path) : docHref(path));
	const selfHref = toDocHref(docPath);
	/** Pages outside a share link are unknown there; anything that looks like one is left unlinked. */
	const looksLikeDoc = (path: string) => /\.md$/i.test(path) || !/\.[^/]+$/.test(path);
	return (tree: Root) => {
		visit(tree, 'element', (node: Element) => {
			if (node.tagName === 'a' && typeof node.properties.href === 'string') {
				const href = node.properties.href;
				if (href.startsWith('#')) {
					// in-page anchors would clash with the hash router, the viewer scrolls instead
					node.properties.href = selfHref;
					node.properties.dataAnchor = safeDecode(href.slice(1));
				} else if (isExternalUrl(href)) {
					if (/^https?:|^\/\//i.test(href)) {
						node.properties.target = '_blank';
						node.properties.rel = ['noopener', 'noreferrer'];
					}
				} else {
					const [path, suffix] = splitSuffix(href);
					const resolved = resolveRelative(folder, safeDecode(path));
					if (resolved === null) return;
					const doc = findDoc(resolved, isDoc);
					if (!doc && shareToken && looksLikeDoc(resolved)) {
						node.tagName = 'span';
						node.properties = {};
						return;
					}
					if (doc) {
						node.properties.href = toDocHref(doc);
						if (suffix.startsWith('#')) node.properties.dataAnchor = safeDecode(suffix.slice(1));
					} else {
						node.properties.href = toFileUrl(resolved);
						node.properties.target = '_blank';
					}
				}
			} else if (node.tagName === 'img' && typeof node.properties.src === 'string') {
				node.properties.loading = 'lazy';
				const src = node.properties.src;
				if (isExternalUrl(src)) return;
				const resolved = resolveRelative(folder, safeDecode(splitSuffix(src)[0]));
				if (resolved !== null) node.properties.src = toFileUrl(resolved);
			}
		});
	};
};

const schema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		a: [...(defaultSchema.attributes?.a ?? []), 'download', 'title']
	}
};

/**
 * Markdown → sanitized HTML. Raw HTML in markdown is allowed (like before) but sanitized,
 * so documents can never run scripts. Uses the same remark parser family as the editor (Milkdown).
 */
export const renderMarkdown = (markdown: string, options: LinkOptions): string =>
	String(
		unified()
			.use(remarkParse)
			.use(remarkFrontmatter, ['yaml'])
			.use(remarkGfm)
			.use(remarkGemoji)
			.use(remarkRehype, { allowDangerousHtml: true })
			.use(rehypeRaw)
			.use(rehypeSanitize, schema)
			// everything below runs on sanitized HTML and only adds trusted attributes
			.use(rehypeSlug)
			.use(rehypeHomedocsLinks, options)
			.use(rehypeHighlight, { detect: false })
			.use(rehypeStringify)
			.processSync(markdown)
	);

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

/** Separates the YAML front matter (kept verbatim) from the markdown body. */
export const splitFrontMatter = (markdown: string) => {
	const match = FRONT_MATTER.exec(markdown);
	return match
		? { frontMatter: match[0], body: markdown.slice(match[0].length) }
		: { frontMatter: '', body: markdown };
};

/** Maps an image/link URL from a document to something the browser can load. */
export const resolveAssetUrl = (url: string, docPath: string) => {
	if (isExternalUrl(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
	const resolved = resolveRelative(docFolder(docPath), safeDecode(splitSuffix(url)[0]));
	return resolved === null ? url : fileUrl(resolved);
};
