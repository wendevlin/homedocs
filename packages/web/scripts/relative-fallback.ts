/**
 * With hash routing SvelteKit only emits a fallback page, and fallback pages always reference
 * `/_app/…` absolutely. Home Assistant ingress serves the app under `/api/hassio_ingress/<token>/`,
 * so the entry page has to load its assets relative to wherever it is served from.
 * (Everything else is already relative: chunks import each other relatively and the base path is
 * computed at runtime from `location`.)
 */
const file = Bun.file(new URL('../build/index.html', import.meta.url))
const html = await file.text()
const relative = html.replaceAll(/(["'(])\/_app\//g, '$1./_app/')
if (/["'(]\/_app\//.test(relative)) throw new Error('index.html still contains absolute asset paths')
await Bun.write(file, relative)
console.info('Rewrote build/index.html to use relative asset paths')
