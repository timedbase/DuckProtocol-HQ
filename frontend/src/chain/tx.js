import { getPublicClient, getWalletClient } from "./client.js";

// Shared by actions.js and dex.js: simulateContract first (a plain eth_call
// against real chain state — reverts surface here, before the wallet ever
// prompts for a signature), then writeContract with the exact simulated
// request. Gas is estimated with a buffer rather than trusting the wallet's
// own eth_estimateGas outright — unused gas is always refunded, so a
// generous buffer costs nothing when the tx succeeds with less. Both Ink and
// Arc are standard chains with no HyperEVM-style small/big block split, so
// neither needs any special-casing here.
//
// `chain`: the resolved CHAINS[slug] config (see chain/addresses.js) the
// call should target — every caller resolves this once (from the app's
// selected chain) and threads it down, same pattern as every other
// chain-aware function in this directory.
export async function simulateAndSend(chain, { address, abi, functionName, args, value, account }) {
  const { hash } = await simulateAndSendWithResult(chain, { address, abi, functionName, args, value, account });
  return hash;
}

// Same as simulateAndSend, but also hands back simulateContract's decoded
// return value -- e.g. the created token's real address, or (for
// DuckRaise.launch) its real campaignId -- straight from the same eth_call
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
