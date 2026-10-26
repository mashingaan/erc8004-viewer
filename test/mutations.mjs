import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = new URL('../', import.meta.url)
const source = await readFile(new URL('viewer.js', root), 'utf8')
const tests = await readFile(new URL('test/viewer.test.js', root), 'utf8')
const cases = [
  ['zero owner', "if (zero.test(result.owner))", 'if (false)'],
  ['data fetch', "result.tokenURI.startsWith('data:')", 'false'],
  ['revoked feedback', 'entries.filter(e => !e.revoked)', 'entries.filter(() => true)'],
  ['score decimals', '10 ** rows[3][i]', '1'],
  ['false summary', 'sum + item.score', 'sum + 1'],
  ['empty no clients', 'if (clients.length)', 'if (true)'],
  ['malformed registration', 'if (!record(result.registration))', 'if (false)'],
  ['RPC error', 'if (body?.error)', 'if (false)']
]
const dir = new URL(`.mutant-${process.pid}/`, root)
await mkdir(dir)
try {
  for (const [name, before, after] of cases) {
    assert(source.includes(before), name)
    const mutant = source.replace(before, after).replace("'./vendor/abi.js'", "'../vendor/abi.js'")
    await writeFile(new URL('viewer.js', dir), mutant)
    await writeFile(new URL('test.js', dir), tests.replace("'../viewer.js'", "'./viewer.js'"))
    assert.equal(spawnSync(process.execPath, ['--check', new URL('viewer.js', dir).pathname.replace(/^\/(\w:)/, '$1')]).status, 0, name)
    const run = spawnSync(process.execPath, ['--test', new URL('test.js', dir).pathname.replace(/^\/(\w:)/, '$1')], {encoding: 'utf8', timeout: 30000})
    const output = `${run.stdout}${run.stderr}`
    assert.notEqual(run.status, 0, `${name} survived`)
    assert.match(output, /AssertionError|ERR_ASSERTION/, `${name} must fail an assertion`)
    assert(!output.includes('ERR_MODULE_NOT_FOUND'), name)
    console.log(`caught: ${name}`)
  }
} finally { await rm(dir, {recursive: true, force: true}) }
