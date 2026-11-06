import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config'

mkdirSync(config.dataDir, { recursive: true })

const db = new Database(join(config.dataDir, 'homedocs.db'), { create: true, strict: true })
db.run('PRAGMA journal_mode = WAL')
db.run(`CREATE TABLE IF NOT EXISTS editors (
	user_id TEXT PRIMARY KEY,
	granted_by TEXT NOT NULL,
	granted_at INTEGER NOT NULL
)`)

const selectEditor = db.query<{ user_id: string }, { id: string }>('SELECT user_id FROM editors WHERE user_id = $id')
const selectEditors = db.query<{ user_id: string }, []>('SELECT user_id FROM editors')
const insertEditor = db.query(
	'INSERT OR REPLACE INTO editors (user_id, granted_by, granted_at) VALUES ($id, $by, $at)',
)
const deleteEditor = db.query('DELETE FROM editors WHERE user_id = $id')

export const isEditor = (userId: string) => selectEditor.get({ id: userId }) !== null

export const listEditorIds = () => new Set(selectEditors.all().map((row) => row.user_id))

export const setEditor = (userId: string, canEdit: boolean, grantedBy: string) => {
	if (canEdit) insertEditor.run({ id: userId, by: grantedBy, at: Date.now() })
	else deleteEditor.run({ id: userId })
}

db.run(`CREATE TABLE IF NOT EXISTS settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
)`)

const selectSetting = db.query<{ value: string }, { key: string }>('SELECT value FROM settings WHERE key = $key')
const upsertSetting = db.query('INSERT OR REPLACE INTO settings (key, value) VALUES ($key, $value)')
const deleteSetting = db.query('DELETE FROM settings WHERE key = $key')

export const getSetting = (key: string) => selectSetting.get({ key })?.value ?? null

export const setSetting = (key: string, value: string | null) => {
	if (value === null) deleteSetting.run({ key })
	else upsertSetting.run({ key, value })
}

db.run(`CREATE TABLE IF NOT EXISTS shares (
	id TEXT PRIMARY KEY,
	path TEXT NOT NULL,
	enabled INTEGER NOT NULL DEFAULT 1,
	created_by TEXT NOT NULL,
	created_by_name TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	last_opened_at INTEGER,
	open_count INTEGER NOT NULL DEFAULT 0
)`)
db.run('CREATE INDEX IF NOT EXISTS shares_path ON shares (path)')

export type ShareRow = {
	id: string
	path: string
	enabled: number
	created_by: string
	created_by_name: string
	created_at: number
	last_opened_at: number | null
	open_count: number
}

const selectShares = db.query<ShareRow, []>('SELECT * FROM shares ORDER BY created_at DESC')
const selectShare = db.query<ShareRow, { id: string }>('SELECT * FROM shares WHERE id = $id')
const insertShare = db.query(
	`INSERT INTO shares (id, path, created_by, created_by_name, created_at)
	VALUES ($id, $path, $by, $byName, $at)`,
)
const updateShareEnabled = db.query('UPDATE shares SET enabled = $enabled WHERE id = $id')
const updateShareOpened = db.query('UPDATE shares SET last_opened_at = $at, open_count = open_count + 1 WHERE id = $id')
const updateSharePath = db.query('UPDATE shares SET path = $path WHERE id = $id')
const deleteShareRow = db.query('DELETE FROM shares WHERE id = $id')

export const listShareRows = () => selectShares.all()
export const getShareRow = (id: string) => selectShare.get({ id })
export const insertShareRow = (id: string, path: string, by: { id: string; name: string }) =>
	insertShare.run({ id, path, by: by.id, byName: by.name, at: Date.now() })
export const setShareEnabled = (id: string, enabled: boolean) => updateShareEnabled.run({ id, enabled: enabled ? 1 : 0 }).changes > 0
export const markShareOpened = (id: string) => updateShareOpened.run({ id, at: Date.now() })
export const setSharePath = (id: string, path: string) => updateSharePath.run({ id, path })
export const deleteShareRowById = (id: string) => deleteShareRow.run({ id }).changes > 0
