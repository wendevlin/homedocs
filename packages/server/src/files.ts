import { stat } from 'node:fs/promises'
import { HttpError } from './http'

/** Types that a browser could execute when opened directly; never served as an active document. */
const ACTIVE_CONTENT = /^(text\/html|application\/xhtml\+xml|text\/xml|application\/xml|image\/svg\+xml|text\/javascript|application\/javascript)/

/** Serves a file from disk. `userContent` files come from the docs folder and are never trusted. */
export const serveFile = async (absolutePath: string, headers: Record<string, string>, userContent: boolean) => {
	const info = await stat(absolutePath).catch(() => null)
	if (!info?.isFile()) throw new HttpError(404, 'Not found')
	const file = Bun.file(absolutePath)
	const securityHeaders: Record<string, string> = { 'X-Content-Type-Options': 'nosniff' }
	if (userContent && ACTIVE_CONTENT.test(file.type)) {
		securityHeaders['Content-Security-Policy'] = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
		if (!file.type.startsWith('image/')) securityHeaders['Content-Disposition'] = 'attachment'
	}
	return new Response(file, { headers: { ...securityHeaders, ...headers } })
}

/** Neither listener should ever end up in a search engine. */
export const ROBOTS_TXT = 'User-agent: *\nDisallow: /\n'

export const robotsResponse = () =>
	new Response(ROBOTS_TXT, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } })
