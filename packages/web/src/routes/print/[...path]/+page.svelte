<script lang="ts">
	import type { DocResponse, TreeNode } from '@homedocs/shared';
	import Folder from '@lucide/svelte/icons/folder';
	import Printer from '@lucide/svelte/icons/printer';
	import { tick } from 'svelte';
	import { api } from '#lib/api.js';
	import { app } from '#lib/app.svelte.js';
	import MarkdownView from '#lib/components/doc/MarkdownView.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { findTrail } from '#lib/paths.js';
	import { errorMessage } from '#lib/tree-actions.svelte.js';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	type Section = { doc: DocResponse; crumbs: { title: string; folder: boolean }[] };
	let sections = $state<Section[] | null>(null);
	let error = $state<string | null>(null);

	/** All documents in navigation order, with the folders they are in. */
	const collect = (nodes: TreeNode[], crumbs: Section['crumbs'] = []) => {
		const result: { path: string; crumbs: Section['crumbs'] }[] = [];
		for (const node of nodes) {
			if (node.type === 'file') {
				result.push({ path: node.path, crumbs: [...crumbs, { title: node.title, folder: false }] });
			} else {
				if (node.index) result.push({ path: node.index, crumbs: [...crumbs, { title: node.title, folder: false }] });
				result.push(...collect(node.children, [...crumbs, { title: node.title, folder: true }]));
			}
		}
		return result;
	};

	const waitForImages = () =>
		Promise.all(
			[...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null)))
		);

	$effect(() => {
		if (!app.loaded) return;
		const single = params.path;
		const entries = single
			? [
					{
						path: single,
						crumbs: (findTrail(app.tree, single) ?? []).map((n) => ({ title: n.title, folder: false }))
					}
				]
			: collect(app.tree);

		Promise.all(entries.map(async (entry) => ({ doc: await api.doc(entry.path), crumbs: entry.crumbs })))
			.then(async (result) => {
				sections = result;
				await tick();
				// the images in the rendered pages are loaded lazily; load them before printing
				for (const img of document.images) img.loading = 'eager';
				await waitForImages();
				window.print();
			})
			.catch((e) => (error = errorMessage(e)));
	});
</script>

<div class="mx-auto max-w-4xl px-6 py-6 print:p-0">
	<div class="mb-6 flex items-center justify-between gap-4 border-b pb-4 print:hidden">
		<p class="text-muted-foreground text-sm">
			Use “Save as PDF” in the print dialog to export {params.path ? 'this page' : 'all pages'}.
		</p>
		<Button onclick={() => window.print()} disabled={!sections}><Printer /> Print</Button>
	</div>

	{#if error}
		<p class="text-muted-foreground">{error}</p>
	{:else if !sections}
		<p class="text-muted-foreground">Preparing pages…</p>
	{:else}
		{#each sections as section (section.doc.path)}
			<section class="print-section mb-12">
				{#if section.crumbs.length > 1 || !params.path}
					<div class="text-muted-foreground mb-4 flex flex-wrap items-center gap-1 text-xs">
						{#each section.crumbs as crumb, i (i)}
							{#if i > 0}<span>/</span>{/if}
							<span class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5">
								{#if crumb.folder}<Folder class="size-3" />{/if}
								{crumb.title}
							</span>
						{/each}
					</div>
				{/if}
				<MarkdownView content={section.doc.content} docPath={section.doc.path} />
			</section>
		{/each}
	{/if}
</div>
