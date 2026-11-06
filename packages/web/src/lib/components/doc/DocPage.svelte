<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import type { DocResponse } from '@homedocs/shared';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import FileText from '@lucide/svelte/icons/file-text';
	import Files from '@lucide/svelte/icons/files';
	import FolderUp from '@lucide/svelte/icons/folder-up';
	import Lock from '@lucide/svelte/icons/lock';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Share2 from '@lucide/svelte/icons/share-2';
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { ApiError, api } from '#lib/api.js';
	import { app } from '#lib/app.svelte.js';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import Editor from '#lib/components/editor/Editor.svelte';
	import { live } from '#lib/live.svelte.js';
	import { docHref, encodePath, findTrail } from '#lib/paths.js';
	import { dialogs, errorMessage } from '#lib/tree-actions.svelte.js';
	import ConflictDialog from './ConflictDialog.svelte';
	import MarkdownView from './MarkdownView.svelte';

	let { path }: { path: string } = $props();

	let doc = $state<DocResponse | null>(null);
	let loadError = $state<string | null>(null);
	let editing = $state(false);
	let draft = $state('');
	let saving = $state(false);
	let conflict = $state<{ currentHash: string | null } | null>(null);

	const dirty = $derived(editing && doc !== null && draft !== doc.content);
	const lock = $derived(live.locks[path]);
	const lockedByOther = $derived(lock !== undefined && !editing);
	const trail = $derived(findTrail(app.tree, path) ?? []);
	/** The folder this page is in (for a folder's index page: that folder), can be shared too. */
	const folder = $derived.by(() => {
		const last = trail.at(-1);
		const candidate = last?.type === 'folder' ? last : trail.at(-2);
		return candidate?.type === 'folder' ? candidate : null;
	});

	const load = async (target: string) => {
		loadError = null;
		try {
			const loaded = await api.doc(target);
			if (target === path) doc = loaded;
		} catch (error) {
			if (target === path) {
				doc = null;
				loadError = error instanceof ApiError && error.status === 404 ? 'This page does not exist.' : errorMessage(error);
			}
		}
	};

	$effect(() => {
		const target = path;
		doc = null;
		load(target);
		return () => {
			if (editing) stopEditing(target);
		};
	});

	const startEditing = async () => {
		if (!doc) return;
		try {
			const result = await live.acquire(path);
			if (!result.granted) {
				toast.warning(`${result.holder.name || 'Someone'} is already editing this page`);
				return;
			}
		} catch (error) {
			toast.error(errorMessage(error));
			return;
		}
		// make sure the editor starts from the latest version on disk
		await load(path);
		if (!doc) return;
		draft = doc.content;
		editing = true;
	};

	const stopEditing = (target = path) => {
		editing = false;
		conflict = null;
		live.release(target);
	};

	const save = async (force = false) => {
		if (!doc || saving) return;
		saving = true;
		try {
			const result = await api.saveDoc({ path, content: draft, baseHash: doc.hash, force });
			if (result.ok) {
				doc = { ...doc, content: draft, hash: result.hash };
				conflict = null;
				toast.success('Saved');
			} else {
				conflict = { currentHash: result.conflict.currentHash };
			}
		} catch (error) {
			toast.error(`Could not save: ${errorMessage(error)}`);
		} finally {
			saving = false;
		}
	};

	const discard = async () => {
		stopEditing();
		await load(path);
		if (!doc) await goto('#/');
	};

	const close = () => {
		if (dirty && !confirm('Discard your unsaved changes?')) return;
		stopEditing();
	};

	const onkeydown = (event: KeyboardEvent) => {
		if (editing && (event.ctrlKey || event.metaKey) && event.key === 's') {
			event.preventDefault();
			save();
		}
	};

	beforeNavigate((navigation) => {
		if (dirty && !confirm('You have unsaved changes. Leave this page anyway?')) {
			navigation.cancel();
		}
	});

	const unsubscribe = live.subscribe((message) => {
		if (message.type === 'doc.saved' && message.path === path && !editing && message.hash !== doc?.hash) {
			toast.info(`${message.by} updated this page`);
			load(path);
		} else if (message.type === 'doc.moved' && (message.from === path || path.startsWith(`${message.from}/`))) {
			goto(docHref(message.to + path.slice(message.from.length)));
		} else if (message.type === 'doc.deleted' && (message.path === path || path.startsWith(`${message.path}/`))) {
			toast.info(`${message.by} deleted this page`);
			goto('#/');
		} else if (message.type === 'lock.lost' && message.path === path && editing) {
			toast.warning('You continued editing this page in another tab');
			editing = false;
		}
	});
	onDestroy(unsubscribe);

	const printUrl = (target?: string) =>
		`${location.href.split('#')[0]}#/print${target ? `/${encodePath(target)}` : ''}`;
</script>

<svelte:window
	{onkeydown}
	onbeforeunload={(event) => {
		if (dirty) event.preventDefault();
	}}
/>

<PageHeader>
	<Breadcrumb.Root>
		<Breadcrumb.List class="flex-nowrap">
			{#each trail as node, i (node.path)}
				{#if i > 0}<Breadcrumb.Separator />{/if}
				<Breadcrumb.Item class="min-w-0">
					{#if i === trail.length - 1}
						<Breadcrumb.Page class="truncate">{node.title}</Breadcrumb.Page>
					{:else if node.type === 'folder' && node.index}
						<Breadcrumb.Link href={docHref(node.index)} class="truncate">{node.title}</Breadcrumb.Link>
					{:else}
						<span class="truncate">{node.title}</span>
					{/if}
				</Breadcrumb.Item>
			{/each}
		</Breadcrumb.List>
	</Breadcrumb.Root>

	{#snippet actions()}
		{#if editing}
			<Button variant="ghost" size="sm" onclick={close}>Close</Button>
			<Button size="sm" disabled={!dirty || saving} onclick={() => save()}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		{:else}
			{#if lock}
				<Badge variant="secondary" class="gap-1">
					<Lock class="size-3" />
					{lock.name} is editing
				</Badge>
			{/if}
			{#if app.editMode && doc}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<span {...props}>
								<Button variant="outline" size="sm" disabled={lockedByOther} onclick={startEditing}>
									<Pencil />
									Edit
								</Button>
							</span>
						{/snippet}
					</Tooltip.Trigger>
					{#if lockedByOther}
						<Tooltip.Content>{lock?.name} is editing this page</Tooltip.Content>
					{/if}
				</Tooltip.Root>
			{/if}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="ghost" size="icon" title="More">
							<EllipsisVertical />
							<span class="sr-only">More</span>
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="min-w-48">
					{#if app.me.isAdmin && doc}
						<DropdownMenu.Item onclick={() => doc && (dialogs.share = { path, title: doc.title })}>
							<Share2 /> Share page
						</DropdownMenu.Item>
						{#if folder}
							{@const shared = folder}
							<DropdownMenu.Item onclick={() => (dialogs.share = { path: shared.path, title: shared.title })}>
								<FolderUp /> Share folder “{shared.title}”
							</DropdownMenu.Item>
						{/if}
						<DropdownMenu.Separator />
					{/if}
					<DropdownMenu.Item onclick={() => window.open(printUrl(path), '_blank')}>
						<FileText /> This page as PDF
					</DropdownMenu.Item>
					<DropdownMenu.Item onclick={() => window.open(printUrl(), '_blank')}>
						<Files /> All pages as PDF
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	{/snippet}
</PageHeader>

<main class="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
	{#if loadError}
		<p class="text-muted-foreground">{loadError}</p>
	{:else if !doc}
		<div class="space-y-4">
			<Skeleton class="h-9 w-2/3" />
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-5/6" />
			<Skeleton class="h-4 w-4/6" />
		</div>
	{:else if editing}
		<Editor bind:value={draft} docPath={path} />
	{:else}
		<MarkdownView content={doc.content} docPath={path} />
	{/if}
</main>

<ConflictDialog
	open={conflict !== null}
	deleted={conflict?.currentHash === null}
	onoverwrite={() => save(true)}
	ondiscard={discard}
	oncancel={() => (conflict = null)}
/>
