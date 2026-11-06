import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// config.ts reads these on import, so they have to be set before any test imports server code
const base = realpathSync(mkdtempSync(join(tmpdir(), 'homedocs-test-')))
Bun.env.DOCS_ROOT = join(base, 'docs')
Bun.env.DATA_DIR = join(base, 'data')
