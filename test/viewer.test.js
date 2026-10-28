import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { encodeFunctionResult, decodeFunctionData } from 'viem'
import { abi } from '../src/abi.js'
import { loadAgent, resolveURI, createReaders } from '../viewer.js'
import { REGISTRIES } from '../config.js'

const owner = '0x1111111111111111111111111111111111111111'
const other = '0x2222222222222222222222222222222222222222'
const registration = {name: 'Measured agent', description: 'Read-only fixture', supportedTrust: ['reputation'], services: [{name: 'web', endpoint: 'https://example.org/'}]}
const inline = data => `data:application/json${String.fromCharCode(59)}base64,${Buffer.from(JSON.stringify(data)).toString('base64')}`
function fixture(overrides = {}) {
  const calls = []
  const values = {ownerOf: owner, tokenURI: 'https://example.org/agent.json', getClients: [owner, other], readAllFeedback: [[owner, other, owner], [1n, 1n, 2n], [750n, -2n, 999n], [1, 0, 0], ['quality', 'risk', 'revoked'], ['', 'speed', ''], [false, false, true]], ...overrides}
  return {calls, options: {agentId: '7', network: 'base', identityRegistry: REGISTRIES.base.identity, reputationRegistry: REGISTRIES.base.reputation, fetchJson: async url => {calls.push(url)
    return registration }, rpc: async (method, params) => {
    assert.equal(method, 'eth_call')
    assert.equal(params[1], 'latest')
    const {functionName, args} = decodeFunctionData({abi, data: params[0].data})
    assert.equal(args[0], 7n)
    assert.equal(params[0].to, functionName === 'ownerOf' || functionName === 'tokenURI' ? REGISTRIES.base.identity : REGISTRIES.base.reputation)
    calls.push(functionName)
    if (functionName === 'readAllFeedback') assert.deepEqual(args.slice(1), [[owner, other], '', '', false])
    const value = values[functionName]
    if (value instanceof Error) throw value
    return encodeFunctionResult({abi, functionName, result: value})
  }}}
}

test('A1 owner tokenURI registration and exact read contract', async () => {
  const {options, calls} = fixture()
  const result = await loadAgent(options)
  assert.equal(result.status, 'ok')
  assert.equal(result.owner, owner)
  assert.equal(result.tokenURI, 'https://example.org/agent.json')
  assert.deepEqual(result.registration, registration)
  assert.deepEqual(calls, ['ownerOf', 'tokenURI', 'https://example.org/agent.json', 'getClients', 'readAllFeedback'])
})
test('A2 IPFS mapping including legacy prefix and no data URI fetch', async () => {
  for (const uri of ['ipfs://bafycid/a.json', 'ipfs://ipfs/bafycid/a.json']) {
    const {options, calls} = fixture({tokenURI: uri})
    assert.equal((await loadAgent(options)).status, 'ok')
    assert(calls.includes('https://ipfs.io/ipfs/bafycid/a.json'))
  }
  for (const uri of [inline({...registration, name: 'Пример'}), `data:application/json,${encodeURIComponent(JSON.stringify(registration))}`]) {
    const {options} = fixture({tokenURI: uri})
    options.fetchJson = () => assert.fail('Data URI must not fetch')
    assert.equal((await loadAgent(options)).status, 'ok')
  }
})
test('A3 zero owner and ownerOf reverts are empty and stop further reads', async () => {
  for (const value of ['0x0000000000000000000000000000000000000000', Object.assign(new Error('missing'), {code: 3}), new Error('execution reverted')]) {
    const {options, calls} = fixture({ownerOf: value})
    assert.equal((await loadAgent(options)).status, 'empty')
    assert.deepEqual(calls, ['ownerOf'])
  }
})
test('A3 tokenURI revert network errors malformed files and adapters never throw', async () => {
  for (const part of ['ownerOf', 'tokenURI', 'getClients', 'readAllFeedback']) {
    const {options} = fixture({[part]: new Error('failed read')})
    assert.equal((await loadAgent(options)).status, 'error')
  }
  for (const bad of [null, [], 'text', 7]) {
    const {options} = fixture()
    options.fetchJson = async () => bad
    assert.equal((await loadAgent(options)).status, 'error')
  }
  const {options} = fixture({tokenURI: 'data:application/json,broken'})
  assert.equal((await loadAgent(options)).status, 'error')
  assert.equal((await loadAgent()).status, 'error')
})
test('A4 score decimals negative values tags revoked filtering and summary', async () => {
  const {options} = fixture()
  assert.deepEqual((await loadAgent(options)).feedback, {count: 2, average: 36.5, items: [{client: owner, score: 75, tags: ['quality']}, {client: other, score: -2, tags: ['risk', 'speed']}]})
})
test('A4 no clients no entries and optional registry do not fabricate averages', async () => {
  for (const override of [{getClients: []}, {readAllFeedback: [[], [], [], [], [], [], []]}]) {
    const {options} = fixture(override)
    const result = await loadAgent(options)
    assert.equal(result.status, 'ok')
    assert.deepEqual(result.feedback, {count: 0, average: null, items: []})
  }
  const {options, calls} = fixture()
  delete options.reputationRegistry
  assert.equal((await loadAgent(options)).status, 'ok')
  assert(!calls.includes('getClients'))
})
test('A4 inconsistent feedback arrays produce error', async () => {
  const {options} = fixture({readAllFeedback: [[owner], [], [1n], [0], [''], [''], [false]]})
  assert.equal((await loadAgent(options)).status, 'error')
})
test('A5 network configurations are distinct and both work with injected RPC', async () => {
  assert.notEqual(REGISTRIES.base.identity, REGISTRIES['base-sepolia'].identity)
  for (const network of Object.keys(REGISTRIES)) {
    const {options} = fixture()
    assert.equal((await loadAgent({...options, network})).status, 'ok')
  }
})
test('A5 actual Kognai Sepolia test identity', {skip: 'No official identity ID or bundle fixture is published in the checked job. Complete with its real source before M2.'}, () => {})
test('A6 static browser module mobile metadata and accessible output', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  assert.match(html, /name="viewport"/)
  assert.match(html, /name="color-scheme"/)
  assert.match(html, /role="status"/)
  assert.match(html, /type="module"/)
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  assert(!app.includes('innerHTML'))
})
test('boundaries invalid IDs networks addresses and unsafe URI schemes', async () => {
  const {options} = fixture()
  for (const agentId of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '', '1e2', 2n ** 256n, {}, null]) assert.equal((await loadAgent({...options, agentId})).status, 'error')
  for (const override of [{network: 'ethereum'}, {identityRegistry: owner + '0'}, {reputationRegistry: 'bad'}]) assert.equal((await loadAgent({...options, ...override})).status, 'error')
  for (const uri of ['javascript:alert(1)', 'file:///etc/passwd', 'ipfs://../a', 'ipfs://', 'https://user:password@example.org/']) assert.throws(() => resolveURI(uri))
})
test('A2 encoded dot segments cannot escape the IPFS gateway prefix', () => {
  for (const uri of ['ipfs://bafycid/%2e%2e/other', 'ipfs://bafycid/.%2E/other', 'ipfs://bafycid/a%2fb', 'ipfs://bafycid/%']) {
    assert.throws(() => resolveURI(uri))
  }
  assert.equal(resolveURI('ipfs://bafycid/space%20name.json'), 'https://ipfs.io/ipfs/bafycid/space%20name.json')
})
test('timeout bounds an adapter that ignores abort and another call recovers', async t => {
  t.mock.timers.enable({apis: ['setTimeout']})
  const {options} = fixture()
  const pending = loadAgent({...options, rpc: () => new Promise(() => {})})
  await Promise.resolve()
  t.mock.timers.tick(15001)
  assert.equal((await pending).status, 'error')
  assert.equal((await loadAgent(options)).status, 'ok')
})
test('network adapters validate HTTP JSON-RPC errors and invalid envelopes', async () => {
  for (const [response, message] of [[new Response('{}', {status: 503}), /HTTP 503/], [Response.json({error: {code: 3, message: 'revert'}}), /revert/], [Response.json({}), /Invalid RPC response/]]) {
    const readers = createReaders('https://rpc.invalid', async () => response)
    await assert.rejects(readers.rpc('eth_call', []), message)
  }
})
