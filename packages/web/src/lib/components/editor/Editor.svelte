<script lang="ts">
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { splitFrontMatter } from '#lib/markdown.js';
	import { errorMessage } from '#lib/tree-actions.svelte.js';
	import CodeEditor from './CodeEditor.svelte';
	import CrepeEditor from './CrepeEditor.svelte';

	type Mode = 'visual' | 'markdown';
	const MODE_KEY = 'homedocs:editor-mode';

	let { value = $bindable(), docPath }: { value: string; docPath: string } = $props();

	const readMode = (): Mode => {
		try {
			return localStorage.getItem(MODE_KEY) === 'markdown' ? 'markdown' : 'visual';
		} catch {
			return 'visual';
		}
	};

	let mode = $state<Mode>(readMode());
	let uploading = $state(false);
	let fileInput: HTMLInputElement;
	let editor = $state<{ insertMarkdown: (markdown: string) => void }>();

	// The visual editor does not know front matter: it is kept aside and put back on every change.
	let frontMatter = $state('');
	let initial = $state('');

	const prepare = (target: Mode) => {
		if (target === 'visual') {
			const split = splitFrontMatter(value);
			frontMatter = split.frontMatter;
			initial = split.body;
		} else {
			initial = value;
		}
	};
	prepare(readMode());

	const setMode = (next: string) => {
		if (next !== 'visual' && next !== 'markdown') return;
		prepare(next);
		mode = next;
		try {
			localStorage.setItem(MODE_KEY, next);
		} catch {
			// not remembered, fine
		}
	};

	/** Keeps a blank line between front matter and content, like most markdown tools write it. */
	const joinFrontMatter = (front: string, body: string) =>
		front && !body.startsWith('\n') ? `${front}\n${body}` : front + body;

	/** Markdown link targets with spaces or parentheses need angle brackets. */
	const linkTarget = (path: string) => (/[\s()]/.test(path) ? `<${path}>` : path);

	const attach = async (files: FileList | null) => {
		if (!files?.length) return;
		uploading = true;
		try {
			for (const file of files) {
				const result = await api.upload(docPath, file);
				const link = `[${result.name}](${linkTarget(result.relativePath)})`;
				editor?.insertMarkdown(result.isImage ? `!${link}` : link);
			}
		} catch (error) {
			toast.error(`Upload failed: ${errorMessage(error)}`);
		} finally {
			uploading = false;
			fileInput.value = '';
		}
	};
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-center gap-2">
		<ToggleGroup.Root type="single" value={mode} onValueChange={setMode} variant="outline" size="sm">
			<ToggleGroup.Item value="visual">Visual</ToggleGroup.Item>
			<ToggleGroup.Item value="markdown">Markdown</ToggleGroup.Item>
		</ToggleGroup.Root>
		<Button variant="outline" size="sm" disabled={uploading} onclick={() => fileInput.click()}>
			<Paperclip />
			{uploading ? 'Uploading…' : 'Attach file'}
		</Button>
		<input bind:this={fileInput} type="file" multiple hidden onchange={(e) => attach(e.currentTarget.files)} />
	</div>

	<div class="bg-background rounded-lg border">
		{#key mode}
			{#if mode === 'visual'}
				<CrepeEditor
					bind:this={editor}
					value={initial}
					{docPath}
					onchange={(markdown) => (value = joinFrontMatter(frontMatter, markdown))}
				/>
			{:else}
				<CodeEditor bind:this={editor} value={initial} onchange={(markdown) => (value = markdown)} />
			{/if}
		{/key}
	</div>
</div>
