export class HttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly body?: Record<string, unknown>,
	) {
		super(message)
	}
}

export const json = (data: unknown, init?: ResponseInit) => Response.json(data, init)

export const errorResponse = (error: unknown): Response => {
	if (error instanceof HttpError) {
		return json({ error: error.message, ...error.body }, { status: error.status })
	}
	console.error(error)
	return json({ error: 'Internal server error' }, { status: 500 })
}

export const readJson = async <T>(req: Request): Promise<T> => {
	try {
		return (await req.json()) as T
	} catch {
		throw new HttpError(400, 'Invalid JSON body')
	}
}

export const requireString = (value: unknown, name: string): string => {
	if (typeof value !== 'string' || value.length === 0) {
		throw new HttpError(400, `"${name}" is required`)
	}
	return value
}
