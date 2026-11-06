import { config } from './config'

/** User as returned by Home Assistant's `config/auth/list` websocket command. */
export type HaUser = {
	id: string
	username: string | null
	name: string
	is_owner: boolean
	is_active: boolean
	system_generated: boolean
	group_ids: string[]
}

const CACHE_MS = 60_000
let cache: { users: HaUser[]; at: number } | null = null

const DEV_USERS: HaUser[] = [
	{ id: 'dev-admin', username: 'admin', name: 'Dev Admin', is_owner: true, is_active: true, system_generated: false, group_ids: ['system-admin'] },
	{ id: 'dev-user', username: 'user', name: 'Dev User', is_owner: false, is_active: true, system_generated: false, group_ids: ['system-users'] },
	{ id: 'dev-guest', username: 'guest', name: 'Dev Guest', is_owner: false, is_active: true, system_generated: false, group_ids: ['system-users'] },
]

/** Runs a single command over the Home Assistant websocket API (through the Supervisor proxy). */
const haCommand = <T>(type: string, token: string): Promise<T> =>
	new Promise((resolve, reject) => {
		const ws = new WebSocket(config.haWebsocketUrl)
		const timeout = setTimeout(() => {
			ws.close()
			reject(new Error(`Home Assistant websocket timeout for ${type}`))
		}, 10_000)
		const finish = (fn: () => void) => {
			clearTimeout(timeout)
			ws.close()
			fn()
		}
		ws.onerror = () => finish(() => reject(new Error('Home Assistant websocket error')))
		ws.onmessage = (event) => {
			const message = JSON.parse(String(event.data))
			if (message.type === 'auth_required') {
				ws.send(JSON.stringify({ type: 'auth', access_token: token }))
			} else if (message.type === 'auth_ok') {
				ws.send(JSON.stringify({ id: 1, type }))
			} else if (message.type === 'auth_invalid') {
				finish(() => reject(new Error('Home Assistant rejected the Supervisor token')))
			} else if (message.type === 'result' && message.id === 1) {
				finish(() =>
					message.success ? resolve(message.result as T) : reject(new Error(message.error?.message ?? `${type} failed`)),
				)
			}
		}
	})

/** All Home Assistant users, cached for a minute. Uses fake users during local development. */
export const listHaUsers = async (): Promise<HaUser[]> => {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.users
	if (!config.supervisorToken) {
		if (Bun.env.NODE_ENV !== 'production') return DEV_USERS
		throw new Error('SUPERVISOR_TOKEN is missing, is "homeassistant_api: true" set in the app config?')
	}
	try {
		const users = await haCommand<HaUser[]>('config/auth/list', config.supervisorToken)
		cache = { users, at: Date.now() }
		return users
	} catch (error) {
		console.error('Could not load Home Assistant users', error)
		// keep serving the last known users instead of locking everyone out
		if (cache) return cache.users
		throw error
	}
}

export const isHaAdmin = (user: HaUser) => user.is_owner || user.group_ids.includes('system-admin')

/** Users that real people log in with (no Supervisor or integration accounts). */
export const isPersonUser = (user: HaUser) => user.is_active && !user.system_generated
