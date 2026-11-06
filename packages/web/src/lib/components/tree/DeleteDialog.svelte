<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { api } from '#lib/api.js';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { dialogs, run } from '#lib/tree-actions.svelte.js';

	const node = $derived(dialogs.remove);

	const confirm = async () => {
		if (!node) return;
		const removed = node;
		dialogs.remove = null;
		const ok = await run(() => api.remove(removed.path));
		const current = page.params.path ?? 'index.md';
		if (ok && (current === removed.path || current.startsWith(`${removed.path}/`))) await goto('#/');
	};
</script>

<AlertDialog.Root open={node !== null} onOpenChange={(open) => !open && (dialogs.remove = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete “{node?.title}”?</AlertDialog.Title>
			<AlertDialog.Description>
				{#if node?.type === 'folder'}
					The folder and everything inside it, including attachments, will be deleted from disk.
				{:else}
					The file will be deleted from disk.
				{/if}
				This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action variant="destructive" onclick={confirm}>
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
