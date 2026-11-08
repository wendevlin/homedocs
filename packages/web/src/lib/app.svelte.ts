import type { Me, TreeNode } from '@homedocs/shared';
import { api } from './api';
import { live } from './live.svelte';
import { collectDocPaths } from './paths';

const TREE_EDIT_MODE_KEY = 'homedocs:tree-edit-mode';

const readTreeEditMode = () => {
	try {
		return localStorage.getItem(TREE_EDIT_MODE_KEY) === '1';
	} catch {
		return false;
	}
};

class App {
	me = $state<Me>({ id: null, name: null, isAdmin: false, canEdit: false });
	tree = $state<TreeNode[]>([]);
	loaded = $state(false);
	error = $state<string | null>(null);
	#treeEditMode = $state(readTreeEditMode());

	docPaths = $derived(collectDocPaths(this.tree));

	/** Sidebar edit mode: add, rename, delete and drag pages in the tree. Pages are edited on their own. */
	get treeEditMode() {
		return this.#treeEditMode && this.me.canEdit;
	}

	set treeEditMode(value: boolean) {
		this.#treeEditMode = value;
		try {
			localStorage.setItem(TREE_EDIT_MODE_KEY, value ? '1' : '0');
		} catch {
			// private mode etc., the mode is just not remembered
		}
	}

	async init() {
		try {
			[this.me, this.tree] = await Promise.all([api.me(), api.tree()]);
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
		}
		this.loaded = true;
		live.connect();
		live.subscribe((message) => {
			if (message.type === 'tree.changed') this.#scheduleTreeReload();
		});
	}

	#reload: ReturnType<typeof setTimeout> | undefined;
	#scheduleTreeReload() {
		clearTimeout(this.#reload);
		this.#reload = setTimeout(() => this.reloadTree(), 150);
	}

	async reloadTree() {
		this.tree = await api.tree();
	}

	isDoc = (path: string) => this.docPaths.has(path);
}

export const app = new App();
