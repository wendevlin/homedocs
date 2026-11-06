import { describe, expect, test } from 'bun:test'
import { LockManager } from '../src/locks'

const alice = { id: 'alice', name: 'Alice' }
const bob = { id: 'bob', name: 'Bob' }

describe('LockManager', () => {
	test('denies a lock held by another user', () => {
		const locks = new LockManager()
		expect(locks.acquire('a.md', 'c1', alice, 1).ok).toBe(true)
		expect(locks.acquire('a.md', 'c2', bob, 2)).toEqual({ ok: false, holder: { userId: 'alice', name: 'Alice', since: 1 } })
		expect(locks.heldByOther('a.md', 'bob')?.name).toBe('Alice')
		expect(locks.heldByOther('a.md', 'alice')).toBeNull()
	})

	test('the same user can take over their lock from another tab', () => {
		const locks = new LockManager()
		locks.acquire('a.md', 'c1', alice)
		const result = locks.acquire('a.md', 'c2', alice)
		expect(result.ok && result.replaced?.connId).toBe('c1')
		expect(locks.release('a.md', 'c1')).toBe(false)
		expect(locks.release('a.md', 'c2')).toBe(true)
	})

	test('releases all locks of a closed connection', () => {
		const locks = new LockManager()
		locks.acquire('a.md', 'c1', alice)
		locks.acquire('b.md', 'c1', alice)
		locks.acquire('c.md', 'c2', bob)
		expect(locks.releaseConnection('c1')).toBe(true)
		expect(Object.keys(locks.snapshot())).toEqual(['c.md'])
	})

	test('expires locks of connections that stopped pinging', () => {
		const locks = new LockManager(1000)
		locks.acquire('a.md', 'c1', alice, 0)
		locks.acquire('b.md', 'c2', bob, 0)
		locks.touch('c2', 900)
		expect(locks.sweep(1500)).toBe(true)
		expect(Object.keys(locks.snapshot())).toEqual(['b.md'])
	})

	test('finds locks inside a folder', () => {
		const locks = new LockManager()
		locks.acquire('house/heating.md', 'c1', alice)
		expect(locks.lockedInside('house')?.name).toBe('Alice')
		expect(locks.lockedInside('house/heating.md')?.name).toBe('Alice')
		expect(locks.lockedInside('hous')).toBeNull()
	})
})
