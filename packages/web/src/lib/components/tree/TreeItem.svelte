<script lang="ts">
	import { page } from '$app/state';
	import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
	import {
		draggable,
		dropTargetForElements
	} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import {
		attachInstruction,
		extractInstruction,
		type Instruction
	} from '@atlaskit/pragmatic-drag-and-drop-hitbox/list-item';
	import type { TreeNode } from '@homedocs/shared';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import Lock from '@lucide/svelte/icons/lock';
	import { app } from '#lib/app.svelte.js';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import { live } from '#lib/live.svelte.js';
	import { docHref } from '#lib/paths.js';
	import { dialogs, type DragData } from '#lib/tree-actions.svelte.js';
	import Self from './TreeItem.svelte';

	let { node, parent }: { node: TreeNode; parent: string } = $props();

	let row = $state<HTMLElement | null>(null);
	let dragging = $state(false);
	let instruction = $state<Instruction | null>(null);

	const currentPath = $derived(page.params.path ?? (page.route.id === '/(app)' ? 'index.md' : ''));
	const docPath = $derived(node.type === 'file' ? node.path : node.index);
	const active = $derived(docPath !== undefined && docPath === currentPath);
	const containsCurrent = $derived(node.type === 'folder' && currentPath.startsWith(`${node.path}/`));
	const lock = $derived(docPath ? live.locks[docPath] : undefined);

	/** A folder page without sub pages is shown like a file, except in sidebar edit mode (to add pages). */
	const expandable = $derived(node.type === 'folder' && (node.children.length > 0 || !node.index || app.treeEditMode));

	let open = $state(false);
	$effect(() => {
		if (containsCurrent) open = true;
	});

	const dragData = (): DragData => ({ type: 'tree-node', path: node.path, name: node.name, parent });

	$effect(() => {
		const element = row;
		if (!element || !app.treeEditMode) return;
		return combine(
			draggable({
				element,
				getInitialData: dragData,
				onDragStart: () => (dragging = true),
				onDrop: () => (dragging = false)
			}),
			dropTargetForElements({
				element,
				canDrop: ({ source }) => {
					const data = source.data as Partial<DragData>;
					return (
						data.type === 'tree-node' &&
						data.path !== node.path &&
						!node.path.startsWith(`${data.path}/`)
					);
				},
				getData: ({ input, element }) =>
					attachInstruction(dragData(), {
						input,
						element,
						operations: {
							'reorder-before': 'available',
							'reorder-after': 'available',
							combine: node.type === 'folder' ? 'available' : 'not-available'
						}
					}),
				onDrag: ({ self }) => (instruction = extractInstruction(self.data)),
				onDragLeave: () => (instruction = null),
				onDrop: () => (instruction = null)
			})
		);
	});
</script>

{#snippet label()}
	{#if node.type === 'folder'}
		{#if open}<FolderOpen />{:else}<Folder />{/if}
	{:else}
		<FileText />
	{/if}
	<span class="truncate">{node.title}</span>
	{#if lock}
		<Tooltip.Root>
			<Tooltip.Trigger class="ml-auto shrink-0">
				<Lock class="text-amber-600 size-3.5" />
			</Tooltip.Trigger>
			<Tooltip.Content>{lock.name} is editing</Tooltip.Content>
		</Tooltip.Root>
	{/if}
{/snippet}

{#snippet actions()}
	{#if app.treeEditMode}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuAction {...props} showOnHover class={expandable ? 'right-7' : ''}>
						<EllipsisVertical />
						<span class="sr-only">Actions for {node.title}</span>
					</Sidebar.MenuAction>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content side="right" align="start">
				{#if node.type === 'folder'}
					<DropdownMenu.Item onclick={() => (dialogs.entry = { kind: 'file', parent: node.path })}>
						New page
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={() => (dialogs.entry = { kind: 'folder', parent: node.path })}>
						New folder
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
				{/if}
				{#if app.me.isAdmin}
					<DropdownMenu.Item onclick={() => (dialogs.share = { path: node.path, title: node.title })}>
						Share…
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
				{/if}
				<DropdownMenu.Item onclick={() => (dialogs.entry = { kind: 'rename', node, parent })}>
					Rename
				</DropdownMenu.Item>
				<DropdownMenu.Item variant="destructive" onclick={() => (dialogs.remove = node)}>
					Delete
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
{/snippet}

<Sidebar.MenuItem
	class={[
		dragging && 'opacity-40',
		instruction?.operation === 'reorder-before' && 'before:bg-primary before:absolute before:inset-x-0 before:-top-px before:h-0.5',
		instruction?.operation === 'reorder-after' && 'after:bg-primary after:absolute after:inset-x-0 after:-bottom-px after:h-0.5'
	]}
>
	{#if node.type === 'folder'}
		<Collapsible.Root bind:open>
			<div
				bind:this={row}
				class={[
					'rounded-md',
					instruction?.operation === 'combine' && 'ring-primary ring-2',
					app.treeEditMode && 'cursor-grab'
				]}
			>
				{#if node.index}
					<Sidebar.MenuButton isActive={active}>
						{#snippet child({ props })}
							<a href={docHref(node.index!)} {...props} draggable={app.treeEditMode ? false : undefined}>{@render label()}</a>
						{/snippet}
					</Sidebar.MenuButton>
				{:else}
					<Collapsible.Trigger>
						{#snippet child({ props })}
							<Sidebar.MenuButton {...props}>{@render label()}</Sidebar.MenuButton>
						{/snippet}
					</Collapsible.Trigger>
				{/if}
			</div>
			{#if expandable}
				<Collapsible.Trigger>
					{#snippet child({ props })}
						<Sidebar.MenuAction {...props} class="transition-transform data-[state=open]:rotate-90">
							<ChevronRight />
							<span class="sr-only">Toggle {node.title}</span>
						</Sidebar.MenuAction>
					{/snippet}
				</Collapsible.Trigger>
			{/if}
			{@render actions()}
			{#if expandable}
				<Collapsible.Content>
					<Sidebar.MenuSub class="mr-0 pr-0">
						{#each node.children as child (child.path)}
							<Self node={child} parent={node.path} />
						{:else}
							<li class="text-muted-foreground px-2 py-1 text-xs">Empty folder</li>
						{/each}
					</Sidebar.MenuSub>
				</Collapsible.Content>
			{/if}
		</Collapsible.Root>
	{:else}
		<div bind:this={row} class={[app.treeEditMode && 'cursor-grab']}>
			<Sidebar.MenuButton isActive={active}>
				{#snippet child({ props })}
					<a href={docHref(node.path)} {...props} draggable={app.treeEditMode ? false : undefined}>{@render label()}</a>
				{/snippet}
			</Sidebar.MenuButton>
		</div>
		{@render actions()}
	{/if}
</Sidebar.MenuItem>
