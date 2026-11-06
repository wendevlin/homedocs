<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import type { SharedDocResponse, ShareInfo } from '@homedocs/shared';
	import Printer from '@lucide/svelte/icons/printer';
	import { api } from '#lib/api.js';
	import logo from '#lib/assets/favicon.svg';
	import ModeToggle from '#lib/components/ModeToggle.svelte';
	import MarkdownView from '#lib/components/doc/MarkdownView.svelte';
	import ShareTreeItem from '#lib/components/share/ShareTreeItem.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { collectDocPaths, sharedDocHref } from '#lib/paths.js';
	import { errorMessage } from '#lib/tree-actions.svelte.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	let info = $state<ShareInfo | null>(null);
	let doc = $state<SharedDocResponse | null>(null);
	let error = $state<string | null>(null);

	/** Pages this link opens; links to them stay clickable. */
	const docs = $derived(
		info?.folder ? collectDocPaths([info.folder]) : new Set(info?.home ? [info.home] : [])
	);
	const current = $derived(params.path || info?.home || '');

	$effect(() => {
		const token = params.token;
		info = null;
		error = null;
		api
			.sharedInfo(token)
			.then((result) => (info = result))
			.catch((e) => (error = errorMessage(e)));
	});

	$effect(() => {
		if (!info) return;
		const token = params.token;
		const path = current;
		doc = null;
		if (!path) return;
		api
			.sharedDoc(token, path)
			.then((result) => {
				if (path === current) doc = result;
			})
			.catch((e) => (error = errorMessage(e)));
	});

	afterNavigate(() => window.scrollTo({ top: 0 }));
</script>

<svelte:head>
	<title>{doc ? `${doc.title} – Homedocs` : 'Homedocs'}</title>
</svelte:head>

{#snippet content()}
	<header
		class="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4 backdrop-blur print:hidden"
	>
		{#if info?.folder}
			<Sidebar.Trigger class="-ml-1" />
			<Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
		{:else}
			<img src={logo} alt="Homedocs" class="size-6" />
		{/if}
		<h1 class="min-w-0 flex-1 truncate font-medium">{doc?.title ?? ''}</h1>
		{#if doc}
			<Button variant="ghost" size="icon-sm" onclick={() => window.print()} title="Print or save as PDF">
				<Printer />
				<span class="sr-only">Print or save as PDF</span>
			</Button>
		{/if}
		{#if !info?.folder}<ModeToggle />{/if}
	</header>

	<main class="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
		{#if error}
			<p class="text-muted-foreground py-16 text-center">{error}</p>
		{:else if info && !current}
			<p class="text-muted-foreground py-16 text-center">This folder has no pages yet.</p>
		{:else if !doc}
			<div class="space-y-4">
				<Skeleton class="h-9 w-2/3" />
				<Skeleton class="h-4 w-full" />
				<Skeleton class="h-4 w-5/6" />
			</div>
		{:else}
			<MarkdownView
				content={doc.content}
				docPath={doc.path}
				shareToken={params.token}
				isDoc={(path) => docs.has(path)}
			/>
		{/if}
	</main>
{/snippet}

{#if info?.folder}
	{@const folder = info.folder}
	<Sidebar.Provider>
		<Sidebar.Root>
			<Sidebar.Header>
				<a
					href={folder.index ? sharedDocHref(params.token, folder.index) : undefined}
					class="flex items-center gap-2 px-2 py-1.5 text-lg font-semibold"
				>
					<img src={logo} alt="" class="size-7" />
					<span class="truncate">{folder.title}</span>
				</a>
			</Sidebar.Header>
			<Sidebar.Content>
				<Sidebar.Group>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each folder.children as node (node.path)}
								<ShareTreeItem {node} token={params.token} {current} />
							{/each}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			</Sidebar.Content>
			<Sidebar.Footer>
				<div class="flex justify-end"><ModeToggle /></div>
			</Sidebar.Footer>
		</Sidebar.Root>
		<Sidebar.Inset>{@render content()}</Sidebar.Inset>
	</Sidebar.Provider>
{:else}
	{@render content()}
{/if}
