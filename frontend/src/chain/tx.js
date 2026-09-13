import { getPublicClient, getWalletClient } from "./client.js";

// Shared by actions.js and dex.js: simulateContract first (a plain eth_call
// against real chain state -- reverts surface here, before the wallet ever
// prompts), then writeContract with the exact simulated request. Gas is the
// estimate plus a 30% buffer; unused gas is refunded.
//
// `chain`: the resolved CHAINS[slug] config the call targets, threaded down
// from the app's selected chain.
export async function simulateAndSend(chain, { address, abi, functionName, args, value, account }) {
  const { hash } = await simulateAndSendWithResult(chain, { address, abi, functionName, args, value, account });
  return hash;
}

// Same as simulateAndSend, but also hands back simulateContract's decoded
// return value -- e.g. the created token's real address, or (for
// DuckCrowdfund.launch) its real campaignId -- straight from the same eth_call
// that already proves the tx succeeds. No guessing/prediction needed.
// `dryRun`: stop after the simulate step -- used by the create flow's
// "Simulate first" button to prove a launch would succeed (with the exact
// same params: vanity salt, metaURI, fees) without ever prompting the
// wallet or broadcasting anything.
export async function simulateAndSendWithResult(chain, { address, abi, functionName, args, value, account, dryRun = false }) {
  const publicClient = getPublicClient(chain);
  const { request, result } = await publicClient.simulateContract({ address, abi, functionName, args, value, account });
  if (dryRun) return { hash: null, result };

  let estimated;
  try {
    estimated = await publicClient.estimateContractGas({ address, abi, functionName, args, value, account });
  } catch {
    // Estimation failing on its own isn't fatal — simulateContract already proved the call succeeds.
  }

  const gas = estimated !== undefined ? (estimated * 130n) / 100n : undefined;
  // getWalletClient() reflects whatever chain the wallet is CURRENTLY
  // connected to -- callers are responsible for having already switched it
  // to `chain` (see App.jsx's write-action guard) before reaching here.
  const wallet = await getWalletClient();
  const hash = await wallet.writeContract(gas ? { ...request, gas } : request);
  return { hash, result };
}
