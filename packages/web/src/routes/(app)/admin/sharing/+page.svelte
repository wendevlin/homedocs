<script lang="ts">
	import type { ShareLink, SharingCheckResult, SharingSettings } from '@homedocs/shared';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import QrCode from '@lucide/svelte/icons/qr-code';
	import Trash from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { ApiError, api } from '#lib/api.js';
	import { app } from '#lib/app.svelte.js';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ShareDialog from '#lib/components/share/ShareDialog.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { docHref } from '#lib/paths.js';
	import { shareBase } from '#lib/share.js';
	import { errorMessage } from '#lib/tree-actions.svelte.js';

	let settings = $state<SharingSettings | null>(null);
	let shares = $state<ShareLink[] | null>(null);
	let error = $state<string | null>(null);

	let remoteUrl = $state('');
	let saving = $state(false);
	let checking = $state(false);
	let check = $state<SharingCheckResult | null>(null);

	let dialog = $state<{ open: boolean; path: string; title: string }>({ open: false, path: '', title: '' });

	const loadShares = async () => {
		shares = await api.shares();
	};

	$effect(() => {
		if (!app.loaded) return;
		if (!app.me.isAdmin) {
			error = 'Only Home Assistant administrators can manage sharing.';
			return;
		}
		Promise.all([api.sharingSettings(), loadShares()])
			.then(([loaded]) => {
				settings = loaded;
				remoteUrl = loaded.remoteUrl ?? '';
			})
			.catch((e) => (error = errorMessage(e)));
	});

	const localBase = $derived(settings ? shareBase(settings, 'local') : null);
	const remoteChanged = $derived(settings !== null && remoteUrl.trim() !== (settings.remoteUrl ?? ''));

	const runCheck = async () => {
		if (!remoteUrl.trim()) return;
		checking = true;
		check = null;
		try {
			check = await api.checkShareUrl(remoteUrl.trim());
		} catch (e) {
			check = { ok: false, message: errorMessage(e) };
		} finally {
			checking = false;
		}
	};

	/** Saving checks the URL first; a failing URL is only saved with `force` ("Save anyway"). */
	const saveRemoteUrl = async (force = false) => {
		saving = true;
		try {
			settings = await api.setRemoteUrl(remoteUrl.trim() || null, force);
			remoteUrl = settings.remoteUrl ?? '';
			check = settings.remoteUrl && !force ? { ok: true, message: 'Share links work through this URL.' } : null;
			toast.success(settings.remoteUrl ? 'Remote URL saved' : 'Remote URL removed');
		} catch (e) {
			if (e instanceof ApiError && e.status === 422) {
				check = { ok: false, message: e.message };
				toast.error('Not saved: the URL does not reach Homedocs');
			} else {
				toast.error(errorMessage(e));
			}
		} finally {
			saving = false;
		}
	};

	const setEnabled = async (share: ShareLink, enabled: boolean) => {
		const previous = share.enabled;
		share.enabled = enabled;
		try {
			await api.setShareEnabled(share.id, enabled);
		} catch (e) {
			share.enabled = previous;
			toast.error(errorMessage(e));
		}
	};

	const remove = async (share: ShareLink) => {
		if (!confirm('Delete this link? QR codes that were printed with it stop working.')) return;
		try {
			await api.deleteShare(share.id);
			shares = shares?.filter((s) => s.id !== share.id) ?? null;
			toast.success('Link deleted');
		} catch (e) {
			toast.error(errorMessage(e));
		}
	};

	const formatDate = (time: number) =>
		new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(time);
</script>

<PageHeader><h1 class="truncate font-medium">Sharing</h1></PageHeader>

<main class="mx-auto w-full max-w-4xl space-y-10 px-4 py-8 md:px-8">
	{#if error}
		<p class="text-muted-foreground">{error}</p>
	{:else if !settings || !shares}
		<div class="space-y-3">
			{#each { length: 3 }, i (i)}<Skeleton class="h-10 w-full" />{/each}
		</div>
	{:else}
		<section class="space-y-4">
			<div>
				<h2 class="text-lg font-semibold">Addresses</h2>
				<p class="text-muted-foreground text-sm">
					Share links open on a separate port ({settings.port}) that only serves shared pages. Anyone
					with a link can read that one page without logging in to Home Assistant.
				</p>
			</div>

			<div class="grid gap-2">
				<Label>Local network</Label>
				{#if localBase}
					<code class="bg-muted rounded-md px-3 py-2 text-sm">{localBase}</code>
					<p class="text-muted-foreground text-xs">
						Works on devices in your home network.{settings.localUrl ? '' : ' Guessed from this browser\'s address.'}
					</p>
				{:else}
					<p class="text-muted-foreground flex items-start gap-2 text-sm">
						<CircleAlert class="mt-0.5 size-4 shrink-0" />
						{settings.localUrlProblem}
					</p>
				{/if}
			</div>

			<form
				class="grid gap-2"
				onsubmit={(event) => {
					event.preventDefault();
					saveRemoteUrl();
				}}
			>
				<Label for="remote-url">Remote URL</Label>
				<div class="flex flex-wrap gap-2">
					<Input
						id="remote-url"
						class="min-w-0 flex-1 basis-64"
						type="url"
						placeholder="https://docs.example.com"
						bind:value={remoteUrl}
						oninput={() => (check = null)}
						autocomplete="off"
					/>
					<Button type="button" variant="outline" disabled={!remoteUrl.trim() || checking} onclick={runCheck}>
						{checking ? 'Checking…' : 'Check'}
					</Button>
					<Button type="submit" disabled={!remoteChanged || saving}>
						{saving ? 'Checking…' : 'Save'}
					</Button>
				</div>
				<p class="text-muted-foreground text-xs">
					Optional. The address under which port {settings.port} is reachable from the internet, e.g.
					through a reverse proxy or tunnel. Links with this address work everywhere.
				</p>
				{#if check}
					<p
						class={[
							'flex items-start gap-2 text-sm',
							check.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
						]}
					>
						{#if check.ok}<CircleCheck class="mt-0.5 size-4 shrink-0" />{:else}<CircleAlert
								class="mt-0.5 size-4 shrink-0"
							/>{/if}
						<span>{check.message}</span>
					</p>
					{#if !check.ok && remoteChanged}
						<p class="text-muted-foreground text-xs">
							If links with this URL do open from your phone, Home Assistant may just not be able to
							reach itself through it.
							<Button variant="link" size="xs" class="h-auto p-0" disabled={saving} onclick={() => saveRemoteUrl(true)}>
								Save anyway
							</Button>
						</p>
					{/if}
				{/if}
			</form>
		</section>

		<section class="space-y-4">
			<div>
				<h2 class="text-lg font-semibold">Share links</h2>
				<p class="text-muted-foreground text-sm">
					All links, from every administrator. Create new ones from a page's
					<EllipsisVertical class="inline size-4" /> menu, for the page or the folder it is in. A disabled link stops working until it is enabled
					again; a deleted one never works again.
				</p>
			</div>

			{#if shares.length === 0}
				<p class="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
					No pages are shared.
				</p>
			{:else}
				<div class="rounded-lg border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Page</Table.Head>
								<Table.Head class="hidden md:table-cell">Created</Table.Head>
								<Table.Head class="hidden sm:table-cell">Opened</Table.Head>
								<Table.Head class="text-right">Enabled</Table.Head>
								<Table.Head class="w-10"><span class="sr-only">Actions</span></Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each shares as share (share.id)}
								<Table.Row>
									<Table.Cell class="max-w-56">
										<div class="flex min-w-0 items-center gap-2">
											{#if share.type === 'folder'}
												<Folder class="text-muted-foreground size-4 shrink-0" />
											{:else}
												<FileText class="text-muted-foreground size-4 shrink-0" />
											{/if}
											{#if !share.title}
												<Badge variant="outline">{share.type === 'folder' ? 'Folder' : 'Page'} missing</Badge>
											{:else if share.type === 'page'}
												<a class="truncate font-medium hover:underline" href={docHref(share.path)}>
													{share.title}
												</a>
											{:else}
												<span class="truncate font-medium">{share.title}</span>
											{/if}
										</div>
										<span class="text-muted-foreground block truncate text-xs">{share.path}</span>
									</Table.Cell>
									<Table.Cell class="text-muted-foreground hidden text-sm md:table-cell">
										{formatDate(share.createdAt)}<br />by {share.createdBy}
									</Table.Cell>
									<Table.Cell class="text-muted-foreground hidden text-sm sm:table-cell">
										{share.openCount}×
										{#if share.lastOpenedAt}<br />last {formatDate(share.lastOpenedAt)}{/if}
									</Table.Cell>
									<Table.Cell class="text-right">
										<Switch
											checked={share.enabled}
											aria-label={`Link to ${share.title ?? share.path} enabled`}
											onCheckedChange={(checked) => setEnabled(share, checked)}
										/>
									</Table.Cell>
									<Table.Cell>
										<DropdownMenu.Root>
											<DropdownMenu.Trigger>
												{#snippet child({ props })}
													<Button {...props} variant="ghost" size="icon-sm" title="More">
														<EllipsisVertical />
														<span class="sr-only">More</span>
													</Button>
												{/snippet}
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end">
												{#if share.title}
													<DropdownMenu.Item
														onclick={() => (dialog = { open: true, path: share.path, title: share.title ?? '' })}
													>
														<QrCode /> Show QR code
													</DropdownMenu.Item>
												{/if}
												<DropdownMenu.Item variant="destructive" onclick={() => remove(share)}>
													<Trash /> Delete link
												</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		</section>
	{/if}
</main>

<ShareDialog bind:open={dialog.open} path={dialog.path} title={dialog.title} onchange={loadShares} />
