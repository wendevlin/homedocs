<script lang="ts">
	import { app } from '#lib/app.svelte.js';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import DocPage from '#lib/components/doc/DocPage.svelte';
</script>

{#if !app.loaded || app.isDoc('index.md')}
	{#if app.loaded}
		<DocPage path="index.md" />
	{/if}
{:else}
	<PageHeader />
	<main class="text-muted-foreground mx-auto max-w-xl px-4 py-16 text-center">
		<h1 class="text-foreground mb-2 text-2xl font-semibold">Welcome to Homedocs</h1>
		<p>Pick a page in the sidebar{app.me.canEdit ? ', or turn on edit mode to create one' : ''}.</p>
	</main>
{/if}
