import type { SocketAddress } from 'bun'
import type { Me } from '@homedocs/shared'
import { config } from './config'
import { isEditor } from './db'
import { isHaAdmin, listHaUsers } from './ha'
import { HttpError } from './http'

export type User = {
	id: string
	name: string
}

/** What a handler knows about the request's user. Handlers never look at auth headers themselves. */
export type RequestContext = {
	user: User | null
	isAdmin: boolean
	canEdit: boolean
}

/**
 * Turns a request into a context, or rejects it.
 * Each listener gets its own resolver: ingress now, later e.g. HA OAuth or share links on an external port.
 */
export type AuthResolver = (
	req: Request,
	server: { requestIP(req: Request): SocketAddress | null },
) => Promise<RequestContext>

const normalizeIp = (ip: string) => ip.replace(/^::ffff:/, '')

const contextForUser = async (id: string, fallbackName: string): Promise<RequestContext> => {
	const haUser = (await listHaUsers()).find((u) => u.id === id)
	const isAdmin = haUser ? isHaAdmin(haUser) : false
	return {
		user: { id, name: haUser?.name || fallbackName },
		isAdmin,
		canEdit: isAdmin || isEditor(id),
	}
}

/**
 * Home Assistant ingress: the Supervisor authenticates the user and passes the identity in headers.
 * The Supervisor strips these headers from client requests, so they can be trusted as long as the
 * request really comes from the Supervisor.
 */
export const ingressResolver: AuthResolver = async (req, server) => {
	const userId = req.headers.get('x-remote-user-id')

	if (config.devUserId && !userId) {
		return contextForUser(config.devUserId, config.devUserId)
	}

	const ip = normalizeIp(server.requestIP(req)?.address ?? '')
	if (!config.devUserId && ip !== config.trustedProxyIp) {
		throw new HttpError(403, 'Homedocs is only available through Home Assistant')
	}

	if (!userId) return { user: null, isAdmin: false, canEdit: false }

	const name = req.headers.get('x-remote-user-display-name') || req.headers.get('x-remote-user-name') || userId
	return contextForUser(userId, name)
}

export const toMe = (ctx: RequestContext): Me => ({
	id: ctx.user?.id ?? null,
	name: ctx.user?.name ?? null,
	isAdmin: ctx.isAdmin,
	canEdit: ctx.canEdit,
})

export const requireEditor = (ctx: RequestContext): User => {
	if (!ctx.user || !ctx.canEdit) throw new HttpError(403, 'You are not allowed to edit')
	return ctx.user
}

export const requireAdmin = (ctx: RequestContext): User => {
	if (!ctx.user || !ctx.isAdmin) throw new HttpError(403, 'Only administrators can do this')
	return ctx.user
}
