<script lang="ts">
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';

	let {
		open,
		deleted,
		onoverwrite,
		ondiscard,
		oncancel
	}: {
		open: boolean;
		/** The file no longer exists on disk */
		deleted: boolean;
		onoverwrite: () => void;
		ondiscard: () => void;
		oncancel: () => void;
	} = $props();
</script>

<AlertDialog.Root {open} onOpenChange={(value) => !value && oncancel()}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>The file changed on disk</AlertDialog.Title>
			<AlertDialog.Description>
				{#if deleted}
					The file was deleted since you started editing.
				{:else}
					Someone changed the file outside of Homedocs since you opened it, e.g. with the
					File editor or Studio Code Server.
				{/if}
				Do you want to overwrite it with your version, or discard your changes and load the
				current file?
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Keep editing</AlertDialog.Cancel>
			<AlertDialog.Action variant="outline" onclick={ondiscard}>
				Discard my changes
			</AlertDialog.Action>
			<AlertDialog.Action variant="destructive" onclick={onoverwrite}>
				Overwrite
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
