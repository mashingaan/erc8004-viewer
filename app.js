import { REGISTRIES, RPCS } from './config.js'
import { loadAgent, createReaders, resolveURI } from './viewer.js'

const $ = id => document.getElementById(id)
const node = (tag, text) => Object.assign(document.createElement(tag), {textContent: text})
function settings() {
  $('rpc').value = RPCS[$('network').value]
  $('identity').value = REGISTRIES[$('network').value].identity
  $('reputation').value = REGISTRIES[$('network').value].reputation
}
settings()
$('network').addEventListener('change', settings)
function link(uri) {
  try { return resolveURI(uri) } catch { return null }
}
function render(result) {
  const box = $('result')
  box.replaceChildren()
  box.hidden = false
  const data = result.registration
  box.append(node('h2', typeof data.name === 'string' ? data.name : `Agent ${result.agentId}`))
  if (typeof data.description === 'string') box.append(node('p', data.description))
  if (link(data.image)) {
    const image = document.createElement('img')
    image.src = link(data.image)
    image.alt = 'Agent registration image'
    image.referrerPolicy = 'no-referrer'
    box.append(image)
  }
  const fields = node('dl', '')
  for (const [label, value] of [['Owner', result.owner], ['Token URI', result.tokenURI], ['Supported trust', Array.isArray(data.supportedTrust) ? data.supportedTrust.join(', ') : 'Not specified']]) fields.append(node('dt', label), node('dd', value))
  box.append(fields, node('h3', 'Endpoints'))
  const endpoints = Array.isArray(data.services) ? data.services : Array.isArray(data.endpoints) ? data.endpoints : []
  for (const service of endpoints) {
    if (!service || typeof service !== 'object') continue
    const line = node('p', `${String(service.name ?? 'Service')}: `)
    const uri = link(service.endpoint)
    if (uri) line.append(Object.assign(node('a', String(service.endpoint)), {href: uri, rel: 'noopener noreferrer', referrerPolicy: 'no-referrer'}))
    else line.append(node('span', String(service.endpoint ?? 'Not specified')))
    box.append(line)
  }
  if (!endpoints.length) box.append(node('p', 'No endpoints specified.'))
  box.append(node('h3', 'Reputation'))
  const feedback = result.feedback
  box.append(node('p', feedback.count ? `${feedback.count} entries. Average ${feedback.average}.` : 'No feedback.'))
  if (feedback.count) box.append(node('p', 'Latest per client first. The registry does not expose global chronology.'))
  const list = node('ul', '')
  for (const item of feedback.items) list.append(node('li', `${item.client}: ${item.score} (${item.tags.join(', ')})`))
  box.append(list)
  const details = node('details', '')
  details.append(node('summary', 'Registration JSON'), node('pre', JSON.stringify(data, null, 2)))
  box.append(details)
}
$('lookup').addEventListener('submit', async event => {
  event.preventDefault()
  $('load').disabled = true
  $('result').hidden = true
  $('status').textContent = 'Reading registry and registration...'
  try {
    const result = await loadAgent({agentId: $('agent').value, network: $('network').value, identityRegistry: $('identity').value, ...($('reputation').value ? {reputationRegistry: $('reputation').value} : {}), ...createReaders($('rpc').value)})
    $('status').textContent = result.status === 'empty' ? 'No such agent.' : result.status === 'error' ? `Could not read agent: ${result.error}` : 'Agent loaded.'
    if (result.status === 'ok') render(result)
  } catch (error) { $('status').textContent = `Could not read agent: ${error.message}` }
  finally { $('load').disabled = false }
})
