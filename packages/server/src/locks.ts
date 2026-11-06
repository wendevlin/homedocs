import type { LockInfo } from '@homedocs/shared'

type Lock = LockInfo & {
	connId: string
	lastSeen: number
}

export type AcquireResult = { ok: true; replaced?: Lock } | { ok: false; holder: LockInfo }

const toInfo = ({ userId, name, since }: Lock): LockInfo => ({ userId, name, since })

/**
 * Edit locks per document, held by a websocket connection.
 * A lock disappears when it is released, when its connection closes or when the connection stops pinging.
 */
export class LockManager {
	private locks = new Map<string, Lock>()

	constructor(private readonly timeoutMs = 2 * 60_000) {}

	/** The same user may take over their own lock (e.g. from another tab), everyone else is denied. */
	acquire(path: string, connId: string, user: { id: string; name: string }, now = Date.now()): AcquireResult {
		const existing = this.locks.get(path)
		if (existing && existing.connId !== connId && existing.userId !== user.id) {
			return { ok: false, holder: toInfo(existing) }
		}
		this.locks.set(path, {
			userId: user.id,
			name: user.name,
			since: existing?.connId === connId ? existing.since : now,
			connId,
			lastSeen: now,
		})
		return existing && existing.connId !== connId ? { ok: true, replaced: existing } : { ok: true }
	}

	release(path: string, connId: string): boolean {
		if (this.locks.get(path)?.connId !== connId) return false
		this.locks.delete(path)
		return true
	}

	releaseConnection(connId: string): boolean {
		let changed = false
		for (const [path, lock] of this.locks) {
			if (lock.connId === connId) {
				this.locks.delete(path)
				changed = true
			}
		}
		return changed
	}

	touch(connId: string, now = Date.now()) {
		for (const lock of this.locks.values()) {
			if (lock.connId === connId) lock.lastSeen = now
		}
	}

	/** Removes locks whose connection stopped pinging. Returns whether anything changed. */
	sweep(now = Date.now()): boolean {
		let changed = false
		for (const [path, lock] of this.locks) {
			if (now - lock.lastSeen > this.timeoutMs) {
				this.locks.delete(path)
				changed = true
			}
		}
		return changed
	}

	/** Lock held on `path` by someone other than `userId`. */
	heldByOther(path: string, userId: string): LockInfo | null {
		const lock = this.locks.get(path)
		return lock && lock.userId !== userId ? toInfo(lock) : null
	}

	/** Any lock on `path` itself or on a document inside the folder `path`. */
	lockedInside(path: string): LockInfo | null {
		for (const [lockedPath, lock] of this.locks) {
			if (lockedPath === path || lockedPath.startsWith(`${path}/`)) return toInfo(lock)
		}
		return null
	}

	snapshot(): Record<string, LockInfo> {
		return Object.fromEntries([...this.locks].map(([path, lock]) => [path, toInfo(lock)]))
	}
}
