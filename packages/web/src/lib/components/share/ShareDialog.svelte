<script lang="ts">
	import type { ShareLink, SharingSettings } from '@homedocs/shared';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import ImageIcon from '@lucide/svelte/icons/image';
	import Printer from '@lucide/svelte/icons/printer';
	import Trash from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import { shareType } from '@homedocs/shared';
	import {
		copyQrImage,
		copyText,
		downloadQr,
		printQr,
		qrPng,
		shareLink,
		type ShareTarget
	} from '#lib/share.js';
	import { errorMessage } from '#lib/tree-actions.svelte.js';

	let {
		open = $bindable(false),
		path,
		title,
		onchange
	}: {
		open?: boolean;
		path: string;
		title: string;
		/** Called after a link was created, enabled, disabled or deleted */
		onchange?: () => void;
	} = $props();

	let share = $state<ShareLink | null>(null);
	let settings = $state<SharingSettings | null>(null);
	let loading = $state(false);
	let busy = $state(false);
	let target = $state<ShareTarget>('local');

	const url = $derived(share && settings ? shareLink(settings, target, share.token) : null);

	$effect(() => {
		if (!open) return;
		const forPath = path;
		loading = true;
		share = null;
		Promise.all([api.shares(forPath), api.sharingSettings()])
			.then(([shares, loadedSettings]) => {
				if (forPath !== path) return;
				share = shares[0] ?? null;
				settings = loadedSettings;
				target = loadedSettings.remoteUrl ? 'remote' : 'local';
			})
			.catch((e) => toast.error(errorMessage(e)))
			.finally(() => (loading = false));
	});

	const act = async (fn: () => Promise<void>) => {
		busy = true;
		try {
			await fn();
			onchange?.();
		} catch (e) {
			toast.error(errorMessage(e));
		} finally {
			busy = false;
		}
	};

	const create = () =>
		act(async () => {
			share = await api.createShare(path);
		});

	const setEnabled = (enabled: boolean) =>
		act(async () => {
			if (!share) return;
			await api.setShareEnabled(share.id, enabled);
			share.enabled = enabled;
		});

	const remove = () => {
		if (!confirm('Delete this link? QR codes that were printed with it stop working.')) return;
		act(async () => {
			if (!share) return;
			await api.deleteShare(share.id);
			share = null;
			toast.success('Link deleted');
		});
	};

	const isFolder = $derived(shareType(path) === 'folder');
	const qrImage = $derived(url ? qrPng(url) : null);

	const copy = async () => {
		if (!url) return;
		if (await copyText(url)) toast.success('Link copied');
		else toast.error('Could not copy, select the link and copy it manually');
	};

	const copyImage = async () => {
		if (!url) return;
		if (await copyQrImage(url)) toast.success('QR code copied');
		else toast.info('Your browser only allows this over HTTPS. Right-click the QR code and choose “Copy image”.');
	};

	const fileName = $derived(`${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'page'}-qr.png`);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Share “{title}”</Dialog.Title>
			<Dialog.Description>
				{#if isFolder}
					Anyone with the link can read all pages in this folder and its subfolders, without logging
					in to Home Assistant. They can't see other pages.
				{:else}
					Anyone with the link can read this page without logging in to Home Assistant. They can't
					see other pages.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if loading || !settings}
			<Skeleton class="mx-auto size-48" />
		{:else if !share}
			<div class="grid justify-items-center gap-3 py-4">
				<Button onclick={create} disabled={busy}>Create link</Button>
			</div>
		{:else}
			<div class="grid gap-4">
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					class="w-full"
					value={target}
					onValueChange={(value) => value && (target = value as ShareTarget)}
				>
					<ToggleGroup.Item value="local" class="flex-1">Local network</ToggleGroup.Item>
					<ToggleGroup.Item value="remote" class="flex-1">Remote</ToggleGroup.Item>
				</ToggleGroup.Root>

				{#if url}
					<img
						src={qrImage}
						alt={`QR code for ${url}`}
						title="Right-click to copy the image"
						class={['mx-auto size-52 rounded-lg', !share.enabled && 'opacity-30']}
					/>
					{#if !share.enabled}
						<p class="text-muted-foreground text-center text-sm">
							This link is disabled. It doesn't open anything until you enable it again.
						</p>
					{/if}
					<div class="flex gap-2">
						<Input value={url} readonly aria-label="Share link" onfocus={(e) => e.currentTarget.select()} />
						<Button variant="outline" size="icon" onclick={copy} title="Copy link">
							<Copy />
							<span class="sr-only">Copy link</span>
						</Button>
					</div>
					<div class="flex flex-wrap justify-center gap-2">
						<Button variant="outline" size="sm" onclick={() => printQr(title, url)}>
							<Printer /> Print QR code
						</Button>
						<Button variant="outline" size="sm" onclick={copyImage}>
							<ImageIcon /> Copy image
						</Button>
						<Button variant="outline" size="sm" onclick={() => downloadQr(fileName, url)}>
							<Download /> Download
						</Button>
					</div>
				{:else}
					<p class="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
						{#if target === 'remote'}
							No remote URL is set yet. An administrator can add one in
							<a class="underline" href="#/admin/sharing" onclick={() => (open = false)}>Sharing</a>.
						{:else}
							{settings.localUrlProblem ?? 'The local address is not known.'}
						{/if}
					</p>
				{/if}

				<div class="flex items-center justify-between gap-2 border-t pt-4">
					<div class="flex items-center gap-2">
						<Switch
							id="share-enabled"
							checked={share.enabled}
							disabled={busy}
							onCheckedChange={setEnabled}
						/>
						<Label for="share-enabled">Link enabled</Label>
					</div>
					<Button variant="ghost" size="sm" class="text-destructive" disabled={busy} onclick={remove}>
						<Trash /> Delete link
					</Button>
				</div>
			</div>
		{/if}

		<p class="text-muted-foreground text-xs">
			All administrators see the share links in
			<a class="underline" href="#/admin/sharing" onclick={() => (open = false)}>Sharing</a>.
		</p>
	</Dialog.Content>
</Dialog.Root>
