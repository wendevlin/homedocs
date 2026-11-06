import type { Me, TreeNode } from '@homedocs/shared';
import { api } from './api';
import { live } from './live.svelte';
import { collectDocPaths } from './paths';

const EDIT_MODE_KEY = 'homedocs:edit-mode';

const readEditMode = () => {
	try {
		return localStorage.getItem(EDIT_MODE_KEY) === '1';
	} catch {
		return false;
	}
};

class App {
	me = $state<Me>({ id: null, name: null, isAdmin: false, canEdit: false });
	tree = $state<TreeNode[]>([]);
	loaded = $state(false);
	error = $state<string | null>(null);
	#editMode = $state(readEditMode());

	docPaths = $derived(collectDocPaths(this.tree));

	/** Edit mode shows the tree editing tools and the edit button on pages. */
	get editMode() {
		return this.#editMode && this.me.canEdit;
	}

	set editMode(value: boolean) {
		this.#editMode = value;
		try {
			localStorage.setItem(EDIT_MODE_KEY, value ? '1' : '0');
		} catch {
			// private mode etc., edit mode is just not remembered
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
