import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { REGISTRIES, RPCS } from '../config.js'
import { createReaders, loadAgent } from '../viewer.js'

const evidence = await Promise.all(Object.keys(REGISTRIES).map(async network => {
  const readers = createReaders(RPCS[network])
  const deployments = {}
  for (const [kind, registry] of Object.entries(REGISTRIES[network])) {
    const code = await readers.rpc('eth_getCode', [registry, 'latest'])
    assert(code.length > 2, `No ${kind} deployment on ${network}`)
    deployments[kind] = {address: registry, codeBytes: (code.length - 2) / 2}
  }
  const result = await loadAgent({agentId: '1', network, identityRegistry: REGISTRIES[network].identity, ...readers})
  // Agent 1 is a public probe, never a claim about the Kognai fixture.
  return {network, deployments, publicProbeAgent: '1', status: result.status, owner: result.owner, tokenURI: result.tokenURI, error: result.error ?? null}
}))
await writeFile(new URL('live-evidence.json', import.meta.url), JSON.stringify({checkedAt: new Date().toISOString(), readOnly: true, evidence}, null, 2))
console.log(JSON.stringify(evidence, null, 2))
