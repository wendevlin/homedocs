<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import { extractInstruction } from '@atlaskit/pragmatic-drag-and-drop-hitbox/list-item';
	import Plus from '@lucide/svelte/icons/plus';
	import Share2 from '@lucide/svelte/icons/share-2';
	import Users from '@lucide/svelte/icons/users';
	import { app } from '#lib/app.svelte.js';
	import logo from '#lib/assets/favicon.svg';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { live } from '#lib/live.svelte.js';
	import { dialogs, moveInTree, type DragData } from '#lib/tree-actions.svelte.js';
	import DeleteDialog from './tree/DeleteDialog.svelte';
	import EntryDialog from './tree/EntryDialog.svelte';
	import TreeItem from './tree/TreeItem.svelte';
	import ShareDialog from './share/ShareDialog.svelte';
	import ModeToggle from './ModeToggle.svelte';

	const sidebar = Sidebar.useSidebar();
	// on phones the sidebar is an overlay, close it once a page was picked
	afterNavigate(() => sidebar.setOpenMobile(false));

	$effect(() =>
		monitorForElements({
			canMonitor: ({ source }) => source.data.type === 'tree-node',
			onDrop: ({ source, location }) => {
				const target = location.current.dropTargets[0];
				if (!target) return;
				const instruction = extractInstruction(target.data);
				if (!instruction || instruction.blocked) return;
				moveInTree(source.data as DragData, target.data as DragData, instruction.operation);
			}
		})
	);
</script>

<Sidebar.Root>
	<Sidebar.Header>
		<a href="#/" class="flex items-center gap-2 px-2 py-1.5 text-lg font-semibold">
			<img src={logo} alt="" class="size-7" />
			Homedocs
		</a>
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Pages</Sidebar.GroupLabel>
			{#if app.editMode}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Sidebar.GroupAction {...props} title="Add page or folder">
								<Plus />
								<span class="sr-only">Add page or folder</span>
							</Sidebar.GroupAction>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="right" align="start">
						<DropdownMenu.Item onclick={() => (dialogs.entry = { kind: 'file', parent: '' })}>
							New page
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => (dialogs.entry = { kind: 'folder', parent: '' })}>
							New folder
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each app.tree as node (node.path)}
						<TreeItem {node} parent="" />
					{:else}
						{#if app.loaded}
							<li class="text-muted-foreground px-2 text-sm">No pages yet</li>
						{:else}
							{#each { length: 5 }, i (i)}
								<Sidebar.MenuSkeleton showIcon />
							{/each}
						{/if}
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Footer>
		{#if app.me.isAdmin}
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton>
						{#snippet child({ props })}
							<a href="#/admin/users" {...props}><Users /> Users</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton>
						{#snippet child({ props })}
							<a href="#/admin/sharing" {...props}><Share2 /> Sharing</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		{/if}
		{#if app.me.canEdit}
			<div class="flex items-center justify-between gap-2 px-2 py-1.5">
				<Label for="edit-mode">Edit mode</Label>
				<Switch
					id="edit-mode"
					checked={app.editMode}
					onCheckedChange={(checked) => (app.editMode = checked)}
				/>
			</div>
		{/if}
		<div class="text-muted-foreground flex items-center gap-2 pl-2 text-xs">
			<span
				class={['size-2 shrink-0 rounded-full', live.connected ? 'bg-emerald-500' : 'bg-muted-foreground/40']}
				title={live.connected ? 'Connected' : 'Reconnecting…'}
			></span>
			<span class="min-w-0 flex-1 truncate">{app.me.name ?? 'Guest'}</span>
			<ModeToggle />
		</div>
	</Sidebar.Footer>
</Sidebar.Root>

<EntryDialog />
{#if app.me.isAdmin}
	<ShareDialog
		bind:open={() => dialogs.share !== null, (open) => !open && (dialogs.share = null)}
		path={dialogs.share?.path ?? ''}
		title={dialogs.share?.title ?? ''}
	/>
{/if}
<DeleteDialog />
