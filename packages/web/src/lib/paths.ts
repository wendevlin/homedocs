import { dirname, type TreeNode } from '@homedocs/shared';

/** Resolves `target` relative to the folder `fromFolder`. Returns null if it leaves the docs root. */
export const resolveRelative = (fromFolder: string, target: string): string | null => {
	const parts = target.startsWith('/') ? [] : fromFolder.split('/').filter(Boolean);
	for (const segment of target.split('/')) {
		if (segment === '' || segment === '.') continue;
		if (segment === '..') {
			if (parts.length === 0) return null;
			parts.pop();
		} else {
			parts.push(segment);
		}
	}
	return parts.join('/');
};

export const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** Hash route of a document. */
export const docHref = (path: string) => (path === 'index.md' ? '#/' : `#/docs/${encodePath(path)}`);

/** Hash route of a page opened through a share link. */
export const sharedDocHref = (token: string, path: string) => `#/s/${token}/${encodePath(path)}`;

export const isExternalUrl = (url: string) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');

/** Every markdown file in the tree, including folder index files. */
export const collectDocPaths = (nodes: TreeNode[], into = new Set<string>()) => {
	for (const node of nodes) {
		if (node.type === 'file') into.add(node.path);
		else {
			if (node.index) into.add(node.index);
			collectDocPaths(node.children, into);
		}
	}
	return into;
};

/** The chain of tree nodes from the top level down to the node for `path`. */
export const findTrail = (nodes: TreeNode[], path: string): TreeNode[] | null => {
	for (const node of nodes) {
		if (node.path === path || (node.type === 'folder' && node.index === path)) return [node];
		if (node.type === 'folder' && path.startsWith(`${node.path}/`)) {
			const rest = findTrail(node.children, path);
			if (rest) return [node, ...rest];
		}
	}
	return null;
};

export const docFolder = (docPath: string) => dirname(docPath);
