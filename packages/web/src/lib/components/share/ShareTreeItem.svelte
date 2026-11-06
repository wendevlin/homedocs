<script lang="ts">
	import type { TreeNode } from '@homedocs/shared';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { sharedDocHref } from '#lib/paths.js';
	import Self from './ShareTreeItem.svelte';

	/** Read-only navigation entry of a shared folder. */
	let { node, token, current }: { node: TreeNode; token: string; current: string } = $props();

	const docPath = $derived(node.type === 'file' ? node.path : node.index);
	const sidebar = Sidebar.useSidebar();
	// on phones the navigation is an overlay, close it once a page was picked
	const close = () => sidebar.setOpenMobile(false);

	let open = $state(false);
	$effect(() => {
		if (node.type === 'folder' && current.startsWith(`${node.path}/`)) open = true;
	});
</script>

{#snippet label()}
	{#if node.type === 'folder'}
		{#if open}<FolderOpen />{:else}<Folder />{/if}
	{:else}
		<FileText />
	{/if}
	<span class="truncate">{node.title}</span>
{/snippet}

<Sidebar.MenuItem>
	{#if node.type === 'folder' && node.children.length > 0}
		<Collapsible.Root bind:open>
			{#if docPath}
				<Sidebar.MenuButton isActive={docPath === current}>
					{#snippet child({ props })}
						<a href={sharedDocHref(token, docPath)} {...props} onclick={close}>{@render label()}</a>
					{/snippet}
				</Sidebar.MenuButton>
			{:else}
				<Collapsible.Trigger>
					{#snippet child({ props })}
						<Sidebar.MenuButton {...props}>{@render label()}</Sidebar.MenuButton>
					{/snippet}
				</Collapsible.Trigger>
			{/if}
			<Collapsible.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuAction {...props} class="transition-transform data-[state=open]:rotate-90">
						<ChevronRight />
						<span class="sr-only">Toggle {node.title}</span>
					</Sidebar.MenuAction>
				{/snippet}
			</Collapsible.Trigger>
			<Collapsible.Content>
				<Sidebar.MenuSub class="mr-0 pr-0">
					{#each node.children as child (child.path)}
						<Self node={child} {token} {current} />
					{/each}
				</Sidebar.MenuSub>
			</Collapsible.Content>
		</Collapsible.Root>
	{:else if docPath}
		<Sidebar.MenuButton isActive={docPath === current}>
			{#snippet child({ props })}
				<a href={sharedDocHref(token, docPath)} {...props} onclick={close}>{@render label()}</a>
			{/snippet}
		</Sidebar.MenuButton>
	{/if}
</Sidebar.MenuItem>
