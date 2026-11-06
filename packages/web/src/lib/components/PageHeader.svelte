<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';

	let { children, actions }: { children?: Snippet; actions?: Snippet } = $props();
</script>

<header
	class="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur print:hidden"
>
	<Sidebar.Trigger class="-ml-1" />
	<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
	<div class="min-w-0 flex-1">{@render children?.()}</div>
	<div class="flex items-center gap-1">
		{@render actions?.()}
	</div>
</header>
