import { writeFile } from 'node:fs/promises'
import { encodeFunctionResult } from 'viem'
import { abi } from '../src/abi.js'
const owner = '0x1111111111111111111111111111111111111111'
const registration = {name: '<img src=x onerror=alert(1)>', description: 'Synthetic browser fixture, never a Kognai identity.', services: [{name: 'web', endpoint: 'javascript:alert(1)'}], supportedTrust: ['reputation']}
const values = {ownerOf: owner, tokenURI: `data:application/json,${encodeURIComponent(JSON.stringify(registration))}`, getClients: [owner], readAllFeedback: [[owner], [1n], [80n], [0], ['quality'], [''], [false]]}
const encoded = Object.fromEntries(Object.entries(values).map(([functionName, result]) => [functionName, encodeFunctionResult({abi, functionName, result})]))
await writeFile(new URL('browser-fixture.json', import.meta.url), JSON.stringify({synthetic: true, encoded}, null, 2))
