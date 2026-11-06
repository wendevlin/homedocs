<script lang="ts">
	import { app } from '#lib/app.svelte.js';
	import { renderMarkdown } from '#lib/markdown.js';

	let {
		content,
		docPath,
		shareToken,
		isDoc = app.isDoc,
		class: className = ''
	}: {
		content: string;
		docPath: string;
		shareToken?: string;
		isDoc?: (path: string) => boolean;
		class?: string;
	} = $props();

	// sanitized in renderMarkdown, see markdown.ts
	const html = $derived(renderMarkdown(content, { docPath, isDoc, shareToken }));

	/** In-page anchors can't use the URL hash (it holds the route), so scroll manually. */
	const onclick = (event: MouseEvent) => {
		const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-anchor]');
		if (!link) return;
		const anchor = link.dataset.anchor!;
		const target =
			document.getElementById(anchor) ?? document.getElementById(`user-content-${anchor}`);
		if (!target || !link.href.endsWith(location.hash)) return;
		event.preventDefault();
		target.scrollIntoView({ behavior: 'smooth' });
	};
</script>

<!-- the click handler only intercepts clicks on links, which are keyboard accessible themselves -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<article class={['markdown prose dark:prose-invert max-w-none', className]} {onclick}>
	{@html html}
</article>
