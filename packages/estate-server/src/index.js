import { startPresence } from './server.js'

const port = Number(process.env.PORT || 8787)
const presence = await startPresence(port)
console.log(`McCowan estate presence listening on ${presence.url}`)
