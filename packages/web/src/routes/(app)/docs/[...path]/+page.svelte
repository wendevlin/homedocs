<script lang="ts">
	import DocPage from '#lib/components/doc/DocPage.svelte';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();
</script>

{#key params.path}
	<DocPage path={params.path} />
{/key}
