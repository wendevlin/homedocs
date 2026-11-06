import type {
	AttachmentResponse,
	DocResponse,
	HomedocsUser,
	Me,
	SaveConflict,
	SaveDocRequest,
	SharedDocResponse,
	ShareInfo,
	ShareLink,
	SharingCheckResult,
	SharingSettings,
	TreeNode
} from '@homedocs/shared';

/**
 * All URLs are relative: behind Home Assistant ingress the app lives under
 * `/api/hassio_ingress/<token>/`, and thanks to hash routing the document URL never changes.
 */
export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly body: Record<string, unknown> = {}
	) {
		super(message);
	}
}

const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
	const response = await fetch(url, {
		...init,
		headers:
			init?.body && !(init.body instanceof FormData)
				? { 'Content-Type': 'application/json', ...init.headers }
				: init?.headers
	});
	const body = response.headers.get('content-type')?.includes('application/json')
		? await response.json()
		: {};
	if (!response.ok) throw new ApiError(response.status, body.error ?? response.statusText, body);
	return body as T;
};

const send = (method: string, body: unknown): RequestInit => ({
	method,
	body: JSON.stringify(body)
});

/** URL of a file inside the docs folder, e.g. an image or a PDF. */
export const fileUrl = (path: string) => `files/${path.split('/').map(encodeURIComponent).join('/')}`;

/** URL of a file that the shared page `docPath` references, served by the share listener. */
export const shareFileUrl = (token: string, path: string, docPath: string) =>
	`share-files/${token}/${path.split('/').map(encodeURIComponent).join('/')}?doc=${encodeURIComponent(docPath)}`;

export const api = {
	me: () => request<Me>('api/me'),
	tree: () => request<TreeNode[]>('api/tree'),
	doc: (path: string) => request<DocResponse>(`api/doc?path=${encodeURIComponent(path)}`),

	saveDoc: async (
		body: SaveDocRequest
	): Promise<{ ok: true; hash: string } | { ok: false; conflict: SaveConflict }> => {
		try {
			const { hash } = await request<{ hash: string }>('api/doc', send('PUT', body));
			return { ok: true, hash };
		} catch (error) {
			if (error instanceof ApiError && error.status === 409) {
				return { ok: false, conflict: error.body as SaveConflict };
			}
			throw error;
		}
	},
	createDoc: (path: string, content: string) =>
		request<{ path: string; hash: string }>('api/doc', send('POST', { path, content })),
	createFolder: (path: string) => request('api/folder', send('POST', { path })),
	move: (from: string, to: string) => request('api/entry', send('PATCH', { from, to })),
	remove: (path: string) =>
		request(`api/entry?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
	order: (folder: string, order: string[]) => request('api/order', send('PUT', { folder, order })),

	upload: (docPath: string, file: File) => {
		const form = new FormData();
		form.set('docPath', docPath);
		form.set('file', file);
		return request<AttachmentResponse>('api/attachments', { method: 'POST', body: form });
	},

	dismissMigrationNotice: () => request('api/migration-notice', { method: 'DELETE' }),

	users: () => request<HomedocsUser[]>('api/users'),
	setCanEdit: (id: string, canEdit: boolean) =>
		request(`api/users/${encodeURIComponent(id)}`, send('PUT', { canEdit })),

	shares: (path?: string) =>
		request<ShareLink[]>(path === undefined ? 'api/shares' : `api/shares?path=${encodeURIComponent(path)}`),
	createShare: (path: string) => request<ShareLink>('api/shares', send('POST', { path })),
	setShareEnabled: (id: string, enabled: boolean) =>
		request(`api/shares/${encodeURIComponent(id)}`, send('PATCH', { enabled })),
	deleteShare: (id: string) => request(`api/shares/${encodeURIComponent(id)}`, { method: 'DELETE' }),
	sharingSettings: () => request<SharingSettings>('api/settings/sharing'),
	/** Fails with 422 if the URL doesn't reach this app, unless `force` is set. */
	setRemoteUrl: (remoteUrl: string | null, force = false) =>
		request<SharingSettings>('api/settings/sharing', send('PUT', { remoteUrl, force })),
	checkShareUrl: (url: string) =>
		request<SharingCheckResult>('api/settings/sharing/check', send('POST', { url })),

	/** Only on the share listener. */
	sharedInfo: (token: string) => request<ShareInfo>(`api/share/${encodeURIComponent(token)}`),
	sharedDoc: (token: string, path: string) =>
		request<SharedDocResponse>(
			`api/share/${encodeURIComponent(token)}/doc?path=${encodeURIComponent(path)}`
		)
};
