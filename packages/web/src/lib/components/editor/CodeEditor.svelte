<script lang="ts">
	import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';
	import { languages } from '@codemirror/language-data';
	import { Compartment } from '@codemirror/state';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { basicSetup, EditorView } from 'codemirror';
	import { mode } from 'mode-watcher';
	import { onMount } from 'svelte';
	import { splitFrontMatter } from '#lib/markdown.js';
	import { emojiAutocomplete } from './emoji-codemirror';

	let {
		value,
		onchange,
		onhistory
	}: {
		value: string;
		onchange: (markdown: string) => void;
		/** Reports whether there is something to undo or redo */
		onhistory?: (history: { canUndo: boolean; canRedo: boolean }) => void;
	} = $props();

	let root: HTMLDivElement;
	let view: EditorView | null = null;
	/** Whether the user put the cursor somewhere; otherwise inserted content is appended. */
	let cursorPlaced = false;
	const theme = new Compartment();

	const baseTheme = EditorView.theme({
		'&': { backgroundColor: 'transparent', fontSize: '14px' },
		'&.cm-focused': { outline: 'none' },
		'.cm-content': { fontFamily: 'var(--font-mono, ui-monospace, monospace)', padding: '1rem 0' },
		'.cm-gutters': { backgroundColor: 'transparent', border: 'none' }
	});

	onMount(() => {
		view = new EditorView({
			doc: value,
			parent: root,
			extensions: [
				basicSetup,
				markdown({ codeLanguages: languages }),
				emojiAutocomplete,
				EditorView.lineWrapping,
				baseTheme,
				theme.of(mode.current === 'dark' ? oneDark : []),
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						onchange(update.state.doc.toString());
						onhistory?.({ canUndo: undoDepth(update.state) > 0, canRedo: redoDepth(update.state) > 0 });
					}
					if (update.selectionSet && update.view.hasFocus) cursorPlaced = true;
				})
			]
		});
		return () => {
			view?.destroy();
			view = null;
		};
	});

	$effect(() => {
		const dark = mode.current === 'dark';
		view?.dispatch({ effects: theme.reconfigure(dark ? oneDark : []) });
	});

	export const undoChange = () => {
		if (view) undo(view);
	};

	export const redoChange = () => {
		if (view) redo(view);
	};

	export const insertMarkdown = (text: string) => {
		if (!view) return;
		// never insert into the front matter, and append when there is no cursor position yet
		const frontMatterEnd = splitFrontMatter(view.state.doc.toString()).frontMatter.length;
		if (!cursorPlaced || view.state.selection.main.from < frontMatterEnd) {
			const end = view.state.doc.length;
			const prefix = view.state.doc.sliceString(end - 1) === '\n' ? '\n' : '\n\n';
			view.dispatch({
				changes: { from: end, insert: `${prefix}${text}\n` },
				selection: { anchor: end + prefix.length + text.length }
			});
		} else {
			view.dispatch(view.state.replaceSelection(text));
		}
		view.focus();
	};
</script>

<div bind:this={root} class="min-h-[60vh]"></div>
