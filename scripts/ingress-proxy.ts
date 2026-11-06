/**
 * Simulates Home Assistant ingress for local testing: serves the app under a path prefix and adds
 * the user headers the Supervisor would add.
 *
 *   TRUSTED_PROXY_IP=127.0.0.1 DOCS_ROOT=.dev/docs DATA_DIR=.dev/data bun packages/server/src/index.ts
 *   bun scripts/ingress-proxy.ts --port 8100 --user dev-admin --name "Dev Admin"
 *   bun scripts/ingress-proxy.ts --port 8101 --user dev-user --name "Dev User"
 *
 * Then open http://localhost:8100/api/hassio_ingress/test123/
 */
import { parseArgs } from 'node:util'
import type { ServerWebSocket } from 'bun'

const { values } = parseArgs({
	options: {
		port: { type: 'string', default: '8100' },
		target: { type: 'string', default: 'http://localhost:8099' },
		user: { type: 'string', default: 'dev-admin' },
		name: { type: 'string', default: 'Dev Admin' },
	},
})

const PREFIX = '/api/hassio_ingress/test123'
const target = new URL(values.target)

const upstreamHeaders = (req: Request) => {
	const headers = new Headers(req.headers)
	// like the Supervisor: never pass through user headers sent by the browser
	for (const name of [...headers.keys()]) {
		if (name.startsWith('x-remote-user')) headers.delete(name)
	}
	headers.set('X-Remote-User-Id', values.user)
	headers.set('X-Remote-User-Name', values.user)
	headers.set('X-Remote-User-Display-Name', values.name)
	headers.delete('host')
	return headers
}

type ProxySocket = { upstream: WebSocket; queue: (string | Buffer)[] }

const server = Bun.serve<{ url: string; headers: Headers } & Partial<ProxySocket>>({
	port: Number(values.port),
	async fetch(req, srv) {
		const url = new URL(req.url)
		if (!url.pathname.startsWith(`${PREFIX}/`)) {
			return Response.redirect(`${PREFIX}/`, 302)
		}
		const upstreamUrl = new URL(url.pathname.slice(PREFIX.length) + url.search, target)

		if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
			upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:'
			const ok = srv.upgrade(req, { data: { url: upstreamUrl.href, headers: upstreamHeaders(req) } })
			return ok ? undefined : new Response('Upgrade failed', { status: 400 })
		}

		return fetch(upstreamUrl, {
			method: req.method,
			headers: upstreamHeaders(req),
			body: req.body,
			redirect: 'manual',
		})
	},
	websocket: {
		open(ws: ServerWebSocket<{ url: string; headers: Headers } & Partial<ProxySocket>>) {
			const headers = Object.fromEntries(
				[...ws.data.headers].filter(([name]) => name.startsWith('x-remote-user') || name === 'cookie'),
			)
			const upstream = new WebSocket(ws.data.url, { headers } as unknown as string[])
			ws.data.upstream = upstream
			ws.data.queue = []
			upstream.onopen = () => {
				for (const message of ws.data.queue ?? []) upstream.send(message)
				ws.data.queue = []
			}
			upstream.onmessage = (event) => ws.send(event.data)
			upstream.onclose = () => ws.close()
		},
		message(ws, message) {
			if (ws.data.upstream?.readyState === WebSocket.OPEN) ws.data.upstream.send(message)
			else ws.data.queue?.push(message)
		},
		close(ws) {
			ws.data.upstream?.close()
		},
	},
})

console.info(`Ingress proxy for "${values.name}": http://localhost:${server.port}${PREFIX}/`)
