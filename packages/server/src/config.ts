import { resolve } from 'node:path'

/** Options set by the user in the Home Assistant app configuration. */
type AppOptions = {
	max_upload_mb?: number
	log_level?: string
}

const env = Bun.env

const dataDir = resolve(env.DATA_DIR ?? '/data')

const readOptions = async (): Promise<AppOptions> => {
	const file = Bun.file(resolve(dataDir, 'options.json'))
	if (!(await file.exists())) return {}
	try {
		return (await file.json()) as AppOptions
	} catch (error) {
		console.error('Could not parse options.json, using defaults', error)
		return {}
	}
}

const options = await readOptions()

export const config = {
	port: Number(env.PORT ?? 8099),
	/**
	 * Port of the share listener: serves only pages opened through a share link, no Home Assistant
	 * login. Mapped to the host in the app's network settings (`ports` in config.yaml).
	 */
	sharePort: Number(env.SHARE_PORT ?? 8098),
	/** The app's own config folder (`app_config` map), visible to users as `/addon_configs/<slug>/` */
	docsRoot: resolve(env.DOCS_ROOT ?? '/config'),
	/**
	 * Where Homedocs 3.x kept the docs (Home Assistant config folder, mapped read-only).
	 * Copied into `docsRoot` once on the first start of this version.
	 */
	legacyDocsRoot: resolve(env.LEGACY_DOCS_ROOT ?? '/homeassistant/homedocs'),
	/**
	 * How users find `docsRoot` (Samba, Studio Code Server): `/addon_configs/<repo>_<slug>`.
	 * The container hostname is `<repo>-<slug>`.
	 */
	userDocsPath: env.HOSTNAME?.includes('-') ? `/addon_configs/${env.HOSTNAME.replace('-', '_')}` : 'the app configuration folder',
	dataDir,
	webDir: resolve(env.WEB_DIR ?? resolve(import.meta.dir, '../../web/build')),
	sampleDocsDir: resolve(env.SAMPLE_DOCS_DIR ?? resolve(import.meta.dir, '../../../sample-docs')),
	/** Only requests from the Supervisor ingress proxy are accepted */
	trustedProxyIp: env.TRUSTED_PROXY_IP ?? '172.30.32.2',
	supervisorToken: env.SUPERVISOR_TOKEN,
	supervisorUrl: env.SUPERVISOR_URL ?? 'http://supervisor',
	haWebsocketUrl: env.HA_WEBSOCKET_URL ?? 'ws://supervisor/core/websocket',
	maxUploadBytes: (options.max_upload_mb ?? 50) * 1024 * 1024,
	/**
	 * Local development only: requests without ingress headers are treated as this user
	 * and the trusted proxy check is skipped.
	 */
	devUserId: env.DEV_USER_ID,
} as const
