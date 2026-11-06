<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';
	import { onMount } from 'svelte';
	import { app } from '#lib/app.svelte.js';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { isShareHost } from '#lib/share.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** On the share port there is no user and no tree, only pages opened through a share link. */
	const shareHost = isShareHost();
	const allowed = $derived(!shareHost || page.route.id === '/s/[token]/[...path]');

	onMount(() => {
		if (!shareHost) app.init();
	});
</script>

<svelte:head>
	<title>Homedocs</title>
</svelte:head>

<ModeWatcher />
<Toaster richColors position="bottom-right" />
<Tooltip.Provider>
	{#if allowed}
		{@render children()}
	{:else}
		<p class="text-muted-foreground p-16 text-center">Open a shared page by scanning its QR code.</p>
	{/if}
</Tooltip.Provider>
