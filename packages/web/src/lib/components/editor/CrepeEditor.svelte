<script lang="ts">
	import { Crepe } from '@milkdown/crepe';
	import '@milkdown/crepe/theme/common/style.css';
	import { editorViewCtx, remarkStringifyOptionsCtx } from '@milkdown/kit/core';
	import { imageSchema } from '@milkdown/kit/preset/commonmark';
	import { redo, redoDepth, undo, undoDepth } from '@milkdown/kit/prose/history';
	import type { EditorState } from '@milkdown/kit/prose/state';
	import { insert } from '@milkdown/kit/utils';
	import { onMount } from 'svelte';
	import { resolveAssetUrl } from '#lib/markdown.js';
	import { emojiPlugin } from './emoji-prosemirror';

	let {
		value,
		docPath,
		onchange,
		onhistory
	}: {
		/** Initial markdown, later changes are reported through `onchange` */
		value: string;
		docPath: string;
		onchange: (markdown: string) => void;
		/** Reports whether there is something to undo or redo */
		onhistory?: (history: { canUndo: boolean; canRedo: boolean }) => void;
	} = $props();

	const reportHistory = (state: EditorState) =>
		onhistory?.({ canUndo: undoDepth(state) > 0, canRedo: redoDepth(state) > 0 });

	let root: HTMLDivElement;
	let crepe: Crepe | null = null;

	onMount(() => {
		const instance = new Crepe({
			root,
			defaultValue: value,
			features: {
				// the viewer does not render math, so don't offer it
				[Crepe.Feature.Latex]: false,
				// Crepe's image blocks store a resize ratio in the alt text and the caption in the title,
				// which would rewrite every image of hand-written markdown. Plain images keep alt and title.
				// Images are added with the "Attach file" button instead.
				[Crepe.Feature.ImageBlock]: false,
				[Crepe.Feature.TopBar]: true
			},
			featureConfigs: {
				[Crepe.Feature.Placeholder]: { text: 'Start writing, or type / for blocks…' }
			}
		});
		// write markdown the way most people write it by hand, so saving changes as little as possible
		instance.editor.config((ctx) =>
			ctx.update(remarkStringifyOptionsCtx, (options) => ({ ...options, bullet: '-' as const, rule: '-' as const }))
		);
		instance.editor.use(
			imageSchema.extendSchema((prev) => (ctx) => {
				const schema = prev(ctx);
				return {
					...schema,
					// image paths are relative to the document, the browser needs them relative to the app
					toDOM: (node) => ['img', { ...node.attrs, src: resolveAssetUrl(node.attrs.src, docPath) }],
					parseMarkdown: {
						...schema.parseMarkdown,
						// remark reports a missing alt/title as null, which the schema rejects (image would be dropped)
						runner: (state, node, type) => {
							state.addNode(type, {
								src: node.url ?? '',
								alt: node.alt ?? '',
								title: node.title ?? ''
							});
						}
					}
				};
			})
		);
		instance.editor.use(emojiPlugin);
		instance.on((listener) =>
			listener.markdownUpdated((ctx, markdown) => {
				onchange(markdown);
				reportHistory(ctx.get(editorViewCtx).state);
			})
		);
		instance.create().then(() => (crepe = instance));
		return () => {
			crepe = null;
			instance.destroy();
		};
	});

	/** Runs a ProseMirror command on the editor and gives the focus back to it. */
	const run = (command: typeof undo) =>
		crepe?.editor.action((ctx) => {
			const view = ctx.get(editorViewCtx);
			command(view.state, view.dispatch);
			view.focus();
		});

	export const undoChange = () => run(undo);
	export const redoChange = () => run(redo);

	export const insertMarkdown = (markdown: string) => {
		crepe?.editor.action(insert(markdown));
	};
</script>

<div bind:this={root} class="crepe-host"></div>
