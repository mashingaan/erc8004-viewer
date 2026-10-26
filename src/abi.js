import { parseAbi, encodeFunctionData, decodeFunctionResult } from 'viem'

// Read-only interfaces pinned to the deployments linked in README.
export const abi = parseAbi([
  'function ownerOf(uint256 agentId) view returns (address)',
  'function tokenURI(uint256 agentId) view returns (string)',
  'function getClients(uint256 agentId) view returns (address[])',
  'function readAllFeedback(uint256 agentId,address[] clients,string tag1,string tag2,bool includeRevoked) view returns (address[],uint64[],int128[],uint8[],string[],string[],bool[])'
])
export const encode = (functionName, args) => encodeFunctionData({abi, functionName, args})
export const decode = (functionName, data) => decodeFunctionResult({abi, functionName, data})
