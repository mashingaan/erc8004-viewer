# ERC-8004 identity viewer

Static, read-only Base and Base Sepolia identity and reputation viewer. Open index.html through any static HTTP server. No backend, key, wallet or paid RPC is required. Untrusted registration text is inserted as text, never HTML. Only HTTP, HTTPS and gateway-resolved IPFS links are displayed as links.

## Run from a fresh clone

Requires Node 20 or 22 and npm for development. The committed viewer runs without installing anything.

```text
git clone https://github.com/mashingaan/erc8004-viewer.git
cd erc8004-viewer
npm ci
npm test
npm run test:mutations
python -m http.server 8080
```

Open http://localhost:8080. Select the network, enter an integer agent ID, then Read agent. RPC and registry overrides are under Read settings. npm run build regenerates vendor/abi.js using pinned viem and esbuild. CI checks that rebuilding changes nothing. Python with playwright 1.58.0 and installed Chrome can run python test/browser.py, exercising a clearly labeled synthetic fixture at 360px in both themes and checking HTML injection resistance and recovery.

## Interface and read flow

```js
import { loadAgent, createReaders } from './viewer.js'
import { REGISTRIES, RPCS } from './config.js'
const network = 'base-sepolia'
const result = await loadAgent({
  agentId: '1', network,
  identityRegistry: REGISTRIES[network].identity,
  reputationRegistry: REGISTRIES[network].reputation,
  ...createReaders(RPCS[network])
})
```

loadAgent first reads ERC-721 ownerOf, then tokenURI and registration JSON. ownerOf revert or zero owner means empty. Other RPC, ABI or file failures mean error. Data JSON is decoded locally, including UTF-8 base64 and percent encoding. IPFS URIs map to https://ipfs.io/ipfs/. Registration must be an object, but unknown fields are preserved. Each injected read is bounded to 15 seconds even if it ignores an AbortSignal. Cancellation of arbitrary injected functions cannot be guaranteed. Production fetch additionally receives an AbortSignal.

Optional reputation uses getClients and readAllFeedback with empty tag filters and revoked entries excluded. Decimal signed values are normalized, all active entries are counted and their arithmetic mean is returned. No feedback yields count 0, average null and an empty items array. Scores from different tags/units are shown without pretending to be a trust rating. The on-chain ABI provides per-client indexes, not global timestamps. Entries show latest per client first, grouped by client. Global latest ordering would need an event indexer and is an explicit PACT clarification, not an invented chronology. Large registries may exceed provider response limits.

## Deployments and ABI provenance

Addresses and read-only signatures were checked against [the official deployment repository](https://github.com/erc-8004/erc-8004-contracts/tree/b9e466c250744a7e06b13dff9d3c2844ed64f825), its README and abis/ReputationRegistry.json. This implementation hand-declares the four read interfaces, and does not copy the contract implementation. See also [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004).

| Network | Identity | Reputation |
| --- | --- | --- |
| Base | 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 | 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 |
| Base Sepolia | 0x8004A818BFB912233c491871b3d84c89A494BD9e | 0x8004B663056A597Dffe9eCcC1965A193B7388713 |

npm run test:live performs only public reads. test/live-evidence.json records deployed code at all four addresses and public agent 1 owner/registration reads on both networks. This public probe is not the Kognai test identity. A successful third-party probe does not fulfill the bundle-specific A5 condition.

## Acceptance and remaining gates

| Item | Evidence |
| --- | --- |
| A1 | Owner, tokenURI, exact eth_call contract, full registration |
| A2 | IPFS, UTF-8 base64 and plain data JSON without network |
| A3 | Empty vs error states, invalid IDs, bad ABI, failed files, malformed JSON, timeouts |
| A4 | Feedback decimals, tags, revoked filtering, count/mean, no-feedback and optional-registry behavior |
| A5 | Both configured networks and public read evidence. Actual Kognai Sepolia identity remains pending |
| A6 | Viewport, 360px light/dark browser form, results, errors, no overflow and safe rendering |

Eight planted meaningful defects must fail assertions. Node 20/22 on Windows/Linux and browser CI run the tests. Unknown hidden tests have not been run.

The checked live job gives no actual Kognai agent ID, tests_url or spec_url. Obtain the genuine published fixture and source at PACT, run it and record the result before M2. Reputation ABI version and chronological ordering expectations must also be agreed. This is a prebuild, not an accepted delivery or a promise of full A5. No transaction, test identity mint or npm publication was performed.

MIT for this code. The committed ABI codec bundles MIT viem, abitype and noble-hashes, with full notices in vendor. esbuild is a development tool. npm audit returned zero known advisories for the pinned lockfile when prepared.
