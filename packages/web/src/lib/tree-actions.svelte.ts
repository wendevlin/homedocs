import { joinPath, type TreeNode } from '@homedocs/shared';
import { toast } from 'svelte-sonner';
import { api } from './api';
import { app } from './app.svelte';

export type DragData = { type: 'tree-node'; path: string; name: string; parent: string };

export type EntryDialog =
	| { kind: 'file' | 'folder'; parent: string }
	| { kind: 'rename'; node: TreeNode; parent: string };

/** A page (`.md`) or folder to share. */
export type ShareTarget = { path: string; title: string };

/** Dialogs opened from the tree or a page, rendered once in the sidebar. */
export const dialogs = $state<{
	entry: EntryDialog | null;
	remove: TreeNode | null;
	share: ShareTarget | null;
}>({
	entry: null,
	remove: null,
	share: null
});

export const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

/** Runs a tree operation, shows errors as toast and refreshes the tree. */
export const run = async (action: () => Promise<unknown>) => {
	try {
		await action();
		return true;
	} catch (error) {
		toast.error(errorMessage(error));
		return false;
	} finally {
		await app.reloadTree().catch(() => {});
	}
};

const childrenOf = (nodes: TreeNode[], folder: string): TreeNode[] => {
	if (folder === '') return nodes;
	for (const node of nodes) {
		if (node.type !== 'folder') continue;
		if (node.path === folder) return node.children;
		if (folder.startsWith(`${node.path}/`)) return childrenOf(node.children, folder);
	}
	return [];
};

export type DropOperation = 'reorder-before' | 'reorder-after' | 'combine';

/** Moves `source` next to or into `target` and stores the new order of the destination folder. */
export const moveInTree = (source: DragData, target: DragData, operation: DropOperation) =>
	run(async () => {
		if (operation === 'combine') {
			if (source.parent !== target.path) {
				await api.move(source.path, joinPath(target.path, source.name));
			}
			return;
		}
		const folder = target.parent;
		if (source.parent !== folder) await api.move(source.path, joinPath(folder, source.name));

		const names = childrenOf(app.tree, folder)
			.map((node) => node.name)
			.filter((name) => name !== source.name);
		const index = names.indexOf(target.name) + (operation === 'reorder-after' ? 1 : 0);
		names.splice(index, 0, source.name);
		await api.order(folder, names);
	});

/** `My Heating System!` → `My-Heating-System` */
export const toFileName = (title: string) =>
	title
		.trim()
		.replaceAll('ß', 'ss')
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[^A-Za-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'page';

export const newDocContent = (title: string, fileName: string) => {
	const frontMatter = fileName === title ? '' : `---\ntitle: ${JSON.stringify(title)}\n---\n\n`;
	return `${frontMatter}# ${title}\n`;
};
