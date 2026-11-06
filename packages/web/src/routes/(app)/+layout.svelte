<script lang="ts">
	import { app } from '#lib/app.svelte.js';
	import AppSidebar from '#lib/components/AppSidebar.svelte';
	import MigrationNotice from '#lib/components/MigrationNotice.svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset>
		{#if app.error}
			<div class="flex flex-1 items-center justify-center p-8">
				<p class="text-muted-foreground max-w-md text-center">
					Homedocs could not be loaded: {app.error}
				</p>
			</div>
		{:else}
			<MigrationNotice />
			{@render children()}
		{/if}
	</Sidebar.Inset>
</Sidebar.Provider>
