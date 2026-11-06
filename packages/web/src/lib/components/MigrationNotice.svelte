<script lang="ts">
	import FolderInput from '@lucide/svelte/icons/folder-input';
	import { api } from '#lib/api.js';
	import { app } from '#lib/app.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';

	const notice = $derived(app.me.migrationNotice);

	const dismiss = async () => {
		app.me.migrationNotice = undefined;
		await api.dismissMigrationNotice().catch(() => {});
	};
</script>

{#if notice}
	<div class="bg-muted/60 flex flex-wrap items-start gap-3 border-b px-4 py-3 text-sm print:hidden">
		<FolderInput class="text-muted-foreground mt-0.5 size-4 shrink-0" />
		<p class="min-w-0 flex-1">
			Your docs moved to <code class="font-mono">{notice.docsPath}</code>. Homedocs no longer uses
			the <code class="font-mono">homedocs</code> folder in your Home Assistant configuration; it was
			copied and left untouched. Once you checked that everything is here, you can delete it.
		</p>
		<Button size="sm" variant="outline" onclick={dismiss}>Got it</Button>
	</div>
{/if}
