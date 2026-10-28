import { encode, decode } from './vendor/abi.js'

const zero = /^0x0{40}$/i
const address = /^0x[0-9a-f]{40}$/i
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const emptyFeedback = () => ({count: 0, average: null, items: []})
const timeoutMs = 15000

async function bounded(call) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(call),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Read timed out')), timeoutMs) })
    ])
  } finally { clearTimeout(timer) }
}

export function resolveURI(uri) {
  if (typeof uri !== 'string') throw new Error('URI must be text')
  if (uri.startsWith('ipfs://')) {
    const path = uri.slice(7).replace(/^ipfs\//, '')
    if (!path || /[?#\\\s]/.test(path) || path.split('/').some(s => {
      const decoded = decodeURIComponent(s)
      return decoded === '..' || decoded === '.' || /[\\/]/.test(decoded)
    })) throw new Error('Invalid IPFS URI')
    return `https://ipfs.io/ipfs/${path}`
  }
  const url = new URL(uri)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsupported URI scheme')
  return url.href
}

function inlineRegistration(uri) {
  const comma = uri.indexOf(',')
  if (comma < 0) throw new Error('Invalid JSON data URI')
  const parts = uri.slice(5, comma).toLowerCase().split(String.fromCharCode(59))
  if (parts.shift() !== 'application/json' || parts.some(s => !['base64', 'charset=utf-8'].includes(s))) throw new Error('Unsupported JSON data URI')
  const payload = decodeURIComponent(uri.slice(comma + 1))
  const text = parts.includes('base64')
    ? new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0)))
    : payload
  return JSON.parse(text)
}

export async function loadAgent(options) {
  const result = {status: 'error', agentId: options?.agentId ?? null, owner: null, tokenURI: null, registration: null, feedback: emptyFeedback()}
  try {
    const {agentId, network, identityRegistry, reputationRegistry, rpc, fetchJson} = options ?? {}
    if (!['base', 'base-sepolia'].includes(network)) throw new Error('Unsupported network')
    if (!address.test(identityRegistry) || zero.test(identityRegistry)) throw new Error('Invalid identity registry')
    if (reputationRegistry !== undefined && (!address.test(reputationRegistry) || zero.test(reputationRegistry))) throw new Error('Invalid reputation registry')
    if (typeof rpc !== 'function' || typeof fetchJson !== 'function') throw new Error('Read adapters are required')
    if ((typeof agentId === 'number' && !Number.isSafeInteger(agentId)) || !['number', 'string', 'bigint'].includes(typeof agentId) || !/^\d+$/.test(String(agentId))) throw new Error('Invalid agent ID')
    const id = BigInt(agentId)
    if (id >= 2n ** 256n) throw new Error('Agent ID exceeds uint256')
    const call = async (registry, name, args) => decode(name, await bounded(() => rpc('eth_call', [{to: registry, data: encode(name, args)}, 'latest'])))
    try { result.owner = await call(identityRegistry, 'ownerOf', [id]) }
    catch (error) {
      if (error?.code === 3 || /revert/i.test(error?.message ?? '')) return {...result, status: 'empty'}
      throw error
    }
    if (zero.test(result.owner)) return {...result, status: 'empty'}
    result.tokenURI = await call(identityRegistry, 'tokenURI', [id])
    result.registration = result.tokenURI.startsWith('data:')
      ? inlineRegistration(result.tokenURI)
      : await bounded(() => fetchJson(resolveURI(result.tokenURI)))
    if (!record(result.registration)) throw new Error('Registration must be a JSON object')
    if (reputationRegistry) {
      const clients = await call(reputationRegistry, 'getClients', [id])
      if (clients.length) {
        const rows = await call(reputationRegistry, 'readAllFeedback', [id, clients, '', '', false])
        if (rows.some(row => row.length !== rows[0].length)) throw new Error('Inconsistent feedback arrays')
        const entries = rows[0].map((client, i) => ({client, index: rows[1][i], score: Number(rows[2][i]) / 10 ** rows[3][i], tags: [rows[4][i], rows[5][i]].filter(Boolean), revoked: rows[6][i]}))
        if (entries.some(e => !Number.isFinite(e.score))) throw new Error('Invalid feedback value')
        // Indexes are per client. Do not imply a global chronology that the ABI lacks.
        const items = entries.filter(e => !e.revoked).sort((a, b) => a.client.toLowerCase().localeCompare(b.client.toLowerCase()) || (a.index > b.index ? -1 : a.index < b.index ? 1 : 0)).map(({client, score, tags}) => ({client, score, tags}))
        result.feedback = {count: items.length, average: items.length ? items.reduce((sum, item) => sum + item.score, 0) / items.length : null, items}
      }
    }
    return {...result, status: 'ok'}
  } catch (error) { return {...result, error: error instanceof Error ? error.message : 'Read failed'} }
}

export function createReaders(rpcURL, fetchImpl = globalThis.fetch) {
  const rpcUrl = new URL(rpcURL)
  if (!['http:', 'https:'].includes(rpcUrl.protocol)) throw new Error('RPC must use HTTP or HTTPS')
  const read = async (url, init) => {
    const response = await fetchImpl(url, {...init, signal: AbortSignal.timeout(timeoutMs)})
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  }
  return {
    rpc: async (method, params) => {
      const body = await bounded(() => read(rpcUrl.href, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})}))
      if (body?.error) throw Object.assign(new Error(body.error.message || 'RPC error'), {code: body.error.code})
      if (typeof body?.result !== 'string') throw new Error('Invalid RPC response')
      return body.result
    },
    fetchJson: url => bounded(() => read(url))
  }
}
