<script lang="ts">
	import type { HomedocsUser } from '@homedocs/shared';
	import { toast } from 'svelte-sonner';
	import { api } from '#lib/api.js';
	import { app } from '#lib/app.svelte.js';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import { errorMessage } from '#lib/tree-actions.svelte.js';

	let users = $state<HomedocsUser[] | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!app.loaded) return;
		if (!app.me.isAdmin) {
			error = 'Only Home Assistant administrators can manage users.';
			return;
		}
		api
			.users()
			.then((result) => (users = result))
			.catch((e) => (error = errorMessage(e)));
	});

	const setCanEdit = async (user: HomedocsUser, canEdit: boolean) => {
		const previous = user.canEdit;
		user.canEdit = canEdit;
		try {
			await api.setCanEdit(user.id, canEdit);
			toast.success(canEdit ? `${user.name} can now edit` : `${user.name} can no longer edit`);
		} catch (e) {
			user.canEdit = previous;
			toast.error(errorMessage(e));
		}
	};
</script>

<PageHeader><h1 class="truncate font-medium">Users</h1></PageHeader>

<main class="mx-auto w-full max-w-4xl px-4 py-8 md:px-8">
	<p class="text-muted-foreground mb-6 text-sm">
		Everyone who can open Homedocs in Home Assistant can read the documentation. Choose who is
		allowed to edit it. Administrators can always edit.
	</p>

	{#if error}
		<p class="text-muted-foreground">{error}</p>
	{:else if !users}
		<div class="space-y-3">
			{#each { length: 3 }, i (i)}<Skeleton class="h-10 w-full" />{/each}
		</div>
	{:else}
		<div class="rounded-lg border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head class="hidden sm:table-cell">Username</Table.Head>
						<Table.Head>Role</Table.Head>
						<Table.Head class="text-right">Can edit</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each users as user (user.id)}
						<Table.Row>
							<Table.Cell class="font-medium">{user.name}</Table.Cell>
							<Table.Cell class="text-muted-foreground hidden sm:table-cell">{user.username ?? '–'}</Table.Cell>
							<Table.Cell>
								{#if user.isOwner}
									<Badge>Owner</Badge>
								{:else if user.isAdmin}
									<Badge>Administrator</Badge>
								{:else}
									<Badge variant="outline">User</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-right">
								<Switch
									checked={user.canEdit}
									disabled={user.isAdmin}
									aria-label={`${user.name} can edit`}
									onCheckedChange={(checked) => setCanEdit(user, checked)}
								/>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}
</main>
