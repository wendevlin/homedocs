import { cp, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from './config'

/** Persistent app state in `/data` (survives updates, unlike the container). */
export type AppState = {
	initializedAt?: string
	/** Set when docs were copied from the old location; shown to admins until dismissed */
	migratedFrom?: string
	migrationNoticeDismissed?: boolean
}

const stateFile = () => Bun.file(join(config.dataDir, 'state.json'))

export const readState = async (): Promise<AppState> => {
	const file = stateFile()
	if (!(await file.exists())) return {}
	try {
		return (await file.json()) as AppState
	} catch {
		return {}
	}
}

export const updateState = async (changes: Partial<AppState>) => {
	await Bun.write(stateFile(), `${JSON.stringify({ ...(await readState()), ...changes }, null, '\t')}\n`)
}

const listEntries = async (folder: string) => {
	try {
		return (await readdir(folder)).filter((name) => !name.startsWith('.'))
	} catch {
		return null
	}
}

export type InitResult = 'existing' | 'migrated' | 'seeded'

/**
 * Prepares the docs folder on startup. Runs once per installation:
 * - docs already there → keep them
 * - docs of Homedocs 3.x found in the Home Assistant config folder → copy them (the old folder is
 *   mounted read-only and stays untouched, the user can delete it)
 * - otherwise → copy the example docs
 */
export const initDocs = async (): Promise<InitResult> => {
	await mkdir(config.docsRoot, { recursive: true })
	await mkdir(config.dataDir, { recursive: true })
	const state = await readState()

	if (state.initializedAt || (await listEntries(config.docsRoot))?.length) {
		if (!state.initializedAt) await updateState({ initializedAt: new Date().toISOString() })
		return 'existing'
	}

	const legacy = await listEntries(config.legacyDocsRoot)
	if (legacy?.length) {
		await cp(config.legacyDocsRoot, config.docsRoot, { recursive: true })
		await updateState({ initializedAt: new Date().toISOString(), migratedFrom: config.legacyDocsRoot })
		console.info(`Copied docs from ${config.legacyDocsRoot} to ${config.docsRoot}`)
		return 'migrated'
	}

	await cp(config.sampleDocsDir, config.docsRoot, { recursive: true })
	await updateState({ initializedAt: new Date().toISOString() })
	console.info(`Copied example docs to ${config.docsRoot}`)
	return 'seeded'
}
