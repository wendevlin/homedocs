import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { referencedPaths } from '../src/links'
import { createShareServer } from '../src/share-server'
import { createShare, deleteSharesInside, listShares, moveShares, normalizeBaseUrl, tokenFor, verifyToken } from '../src/shares'
import { setShareEnabled } from '../src/db'
import { setupDocs } from './helpers'

const admin = { id: 'admin', name: 'Admin' }

describe('share tokens', () => {
	test('round trip', () => {
		expect(verifyToken(tokenFor('abcdefghijklmnop'))).toBe('abcdefghijklmnop')
	})

	test('rejects a wrong signature or a malformed token', () => {
		const token = tokenFor('abcdefghijklmnop')
		// not the last character: it only carries 2 bits, the rest is padding
		const [id, signature] = token.split('.') as [string, string]
		const tampered = `${id}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`
		expect(verifyToken(tampered)).toBeNull()
		expect(verifyToken(`bcdefghijklmnopq.${token.split('.')[1]}`)).toBeNull()
		expect(verifyToken('nope')).toBeNull()
	})
})

describe('referenced paths', () => {
	test('collects links, images, reference definitions and html attributes', () => {
		const md = [
			'![a](attachments/a.png) [pdf](<../manuals/b c.pdf>) [web](https://x.y) [anchor](#top)',
			'[ref]: ./c.txt',
			'<img src="d.jpg"> <a href="/root.png">x</a>',
			'[out](../../../etc/passwd)',
		].join('\n')
		expect([...referencedPaths(md, 'house/kitchen')].sort()).toEqual([
			'house/kitchen/attachments/a.png',
			'house/kitchen/c.txt',
			'house/kitchen/d.jpg',
			'house/manuals/b c.pdf',
			'root.png',
		])
	})
})

describe('base urls', () => {
	test('normalizes and validates', () => {
		expect(normalizeBaseUrl(' https://docs.example.com/homedocs/ ')).toBe('https://docs.example.com/homedocs')
		expect(() => normalizeBaseUrl('ftp://x')).toThrow()
		expect(() => normalizeBaseUrl('https://x/?a=1')).toThrow()
		expect(() => normalizeBaseUrl('not a url')).toThrow()
	})
})

describe('share links', () => {
	const server = createShareServer({ port: 0 })
	const base = `http://localhost:${server.port}`
	afterAll(() => server.stop(true))

	beforeEach(async () => {
		for (const share of await listShares()) deleteSharesInside(share.path)
		await setupDocs({
			'house/heating.md': '# Heating\n![boiler](attachments/boiler.png) [other](other.md)',
			'house/attachments/boiler.png': 'png',
			'house/attachments/secret.png': 'secret',
			'house/other.md': 'other page',
			'outside.md': 'outside [boiler](house/attachments/boiler.png)',
		})
	})

	test('only existing pages can be shared', async () => {
		expect(createShare('house/missing.md', admin)).rejects.toThrow()
	})

	test('serves the shared page and only the files it references', async () => {
		const share = await createShare('house/heating.md', admin)
		const doc = await fetch(`${base}/api/share/${share.token}`)
		expect(doc.status).toBe(200)
		expect(doc.headers.get('x-robots-tag')).toContain('noindex')
		expect(((await doc.json()) as { title: string }).title).toBe('heating')

		expect((await fetch(`${base}/share-files/${share.token}/house/attachments/boiler.png`)).status).toBe(200)
		expect((await fetch(`${base}/share-files/${share.token}/house/attachments/secret.png`)).status).toBe(404)
		expect((await fetch(`${base}/share-files/${share.token}/house/other.md`)).status).toBe(404)

		const [listed] = await listShares('house/heating.md')
		expect(listed?.openCount).toBe(1)
	})

	test('disabled and unknown links look the same', async () => {
		const share = await createShare('house/heating.md', admin)
		setShareEnabled(share.id, false)
		const disabled = await fetch(`${base}/api/share/${share.token}`)
		const unknown = await fetch(`${base}/api/share/${tokenFor('zzzzzzzzzzzzzzzz')}`)
		expect(disabled.status).toBe(404)
		expect(unknown.status).toBe(404)
		expect(await disabled.json()).toEqual(await unknown.json())
	})

	test('the QR code URL redirects into the app', async () => {
		const share = await createShare('house/heating.md', admin)
		const response = await fetch(`${base}/s/${share.token}`, { redirect: 'manual' })
		expect(response.status).toBe(302)
		expect(response.headers.get('location')).toBe(`../#/s/${share.token}`)
		expect((await fetch(`${base}/s/garbage`, { redirect: 'manual' })).status).toBe(404)
	})

	test('nothing else is served', async () => {
		expect(await (await fetch(`${base}/robots.txt`)).text()).toContain('Disallow: /')
		for (const path of ['/api/tree', '/api/me', '/files/house/heating.md', '/ws']) {
			expect((await fetch(`${base}${path}`)).status).toBe(404)
		}
	})

	test('a folder link opens the pages inside the folder and nothing else', async () => {
		const share = await createShare('house', admin)
		expect(share.type).toBe('folder')
		const info = (await (await fetch(`${base}/api/share/${share.token}`)).json()) as { type: string; home: string; folder: { children: unknown[] } }
		expect(info.type).toBe('folder')
		expect(info.home).toBe('house/heating.md')
		expect(info.folder.children).toHaveLength(2)

		const doc = (path: string) => fetch(`${base}/api/share/${share.token}/doc?path=${encodeURIComponent(path)}`)
		expect((await doc('house/other.md')).status).toBe(200)
		expect((await doc('outside.md')).status).toBe(404)
		expect((await doc('house/../outside.md')).status).toBe(404)
		expect((await doc('house/attachments/boiler.png')).status).toBe(404)

		const file = (path: string, from: string) => fetch(`${base}/share-files/${share.token}/${path}?doc=${encodeURIComponent(from)}`)
		expect((await file('house/attachments/boiler.png', 'house/heating.md')).status).toBe(200)
		expect((await file('house/attachments/boiler.png', 'house/other.md')).status).toBe(404)
		expect((await file('house/attachments/boiler.png', 'outside.md')).status).toBe(404)
	})

	test('a page link only opens its page', async () => {
		const share = await createShare('house/heating.md', admin)
		expect((await fetch(`${base}/api/share/${share.token}/doc?path=house/other.md`)).status).toBe(404)
		expect((await fetch(`${base}/api/share/${share.token}/doc`)).status).toBe(200)
	})

	test('only existing folders can be shared', async () => {
		expect(createShare('nothing', admin)).rejects.toThrow('Folder not found')
	})

	test('links follow moved pages and disappear with deleted ones', async () => {
		const share = await createShare('house/heating.md', admin)
		moveShares('house', 'home')
		expect((await listShares()).find((s) => s.id === share.id)?.path).toBe('home/heating.md')
		deleteSharesInside('home')
		expect(await listShares()).toEqual([])
	})
})

describe('remote url setting', () => {
	const { createServer } = require('../src/server') as typeof import('../src/server')
	const admin = async () => ({ user: { id: 'dev-admin', name: 'Admin' }, isAdmin: true, canEdit: true })
	const ingress = createServer({ port: 0, resolver: admin })
	const share = createShareServer({ port: 0 })
	const put = (body: unknown) =>
		fetch(`http://localhost:${ingress.server.port}/api/settings/sharing`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
	afterAll(() => {
		ingress.stop()
		share.stop(true)
	})

	test('a URL that does not reach this app is not saved unless forced', async () => {
		const wrong = `http://localhost:${ingress.server.port}`
		const refused = await put({ remoteUrl: wrong })
		expect(refused.status).toBe(422)
		expect(((await (await put({ remoteUrl: null })).json()) as { remoteUrl: string | null }).remoteUrl).toBeNull()

		const right = `http://localhost:${share.port}`
		expect(((await (await put({ remoteUrl: right })).json()) as { remoteUrl: string }).remoteUrl).toBe(right)
		expect(((await (await put({ remoteUrl: wrong, force: true })).json()) as { remoteUrl: string }).remoteUrl).toBe(wrong)
	})
})
