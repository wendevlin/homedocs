import { ingressResolver } from './auth'
import { config } from './config'
import { createServer } from './server'
import { createShareServer } from './share-server'
import { initDocs } from './setup'

await initDocs()

const { server } = createServer({ port: config.port, resolver: ingressResolver })
const shareServer = createShareServer({ port: config.sharePort })

console.info(`Homedocs is running on port ${server.port}, serving ${config.docsRoot}`)
console.info(`Share links are served on port ${shareServer.port}`)
if (config.devUserId) console.warn(`Development mode: requests without ingress headers are treated as "${config.devUserId}"`)
