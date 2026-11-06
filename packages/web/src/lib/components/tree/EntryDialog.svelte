<script lang="ts">
	import { goto } from '$app/navigation';
	import { joinPath } from '@homedocs/shared';
	import { api } from '#lib/api.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { docHref } from '#lib/paths.js';
	import { dialogs, newDocContent, run, toFileName } from '#lib/tree-actions.svelte.js';

	let value = $state('');
	let busy = $state(false);

	const entry = $derived(dialogs.entry);
	const isRenamingFile = $derived(entry?.kind === 'rename' && entry.node.type === 'file');

	const texts = $derived.by(() => {
		if (entry?.kind === 'file') return { title: 'New page', label: 'Title', action: 'Create' };
		if (entry?.kind === 'folder') return { title: 'New folder', label: 'Folder name', action: 'Create' };
		return { title: 'Rename', label: isRenamingFile ? 'File name' : 'Folder name', action: 'Rename' };
	});

	const fileName = $derived(entry?.kind === 'file' ? `${toFileName(value)}.md` : '');

	$effect(() => {
		if (entry?.kind === 'rename') value = entry.node.name.replace(/\.md$/i, '');
		else if (entry) value = '';
	});

	const close = () => (dialogs.entry = null);

	const submit = async (event: SubmitEvent) => {
		event.preventDefault();
		const current = entry;
		const name = value.trim();
		if (!current || !name || busy) return;
		if (current.kind !== 'file' && (name.includes('/') || name.startsWith('.'))) return;
		busy = true;
		const ok = await run(async () => {
			if (current.kind === 'rename') {
				const newName = current.node.type === 'file' ? `${name}.md` : name;
				if (newName !== current.node.name) {
					await api.move(current.node.path, joinPath(current.parent, newName));
				}
			} else if (current.kind === 'file') {
				const path = joinPath(current.parent, fileName);
				await api.createDoc(path, newDocContent(name, toFileName(name)));
				await goto(docHref(path));
			} else {
				await api.createFolder(joinPath(current.parent, name));
			}
		});
		busy = false;
		if (ok) close();
	};
</script>

<Dialog.Root open={entry !== null} onOpenChange={(open) => !open && close()}>
	<Dialog.Content class="sm:max-w-md">
		<form onsubmit={submit} class="grid gap-4">
			<Dialog.Header>
				<Dialog.Title>{texts.title}</Dialog.Title>
			</Dialog.Header>
			<div class="grid gap-2">
				<Label for="entry-name">{texts.label}</Label>
				<Input id="entry-name" bind:value autocomplete="off" required />
				{#if entry?.kind === 'file' && value.trim()}
					<p class="text-muted-foreground text-xs">Saved as <code>{fileName}</code></p>
				{:else if entry?.kind === 'rename'}
					<p class="text-muted-foreground text-xs">Links from other pages to this entry are not updated.</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Button variant="outline" type="button" onclick={close}>Cancel</Button>
				<Button type="submit" disabled={busy || !value.trim()}>{texts.action}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
