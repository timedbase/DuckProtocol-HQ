import { getPublicClient } from "./client.js";
import { DUCK_TOKEN_ABI } from "./abis.js";

// The subgraph doesn't index name/symbol for CURVE/INSTANT tokens -- neither
// DuckIncubation's TokenCreated nor DuckLauncher's TokenLaunched carries
// them (only DuckRaise's CampaignCreated does, since a campaign's name/
// symbol are chosen before the token itself exists). Every token clone is a
// real ERC20 with its own name()/symbol() though, so this reads them
// directly, batched into as few RPC round-trips as possible via multicall.
export async function fetchTokenMeta(chain, addresses) {
  if (addresses.length === 0) return {};
  const publicClient = getPublicClient(chain);

  const contracts = addresses.flatMap((address) => [
    { address, abi: DUCK_TOKEN_ABI, functionName: "name" },
    { address, abi: DUCK_TOKEN_ABI, functionName: "symbol" },
  ]);

  const results = await publicClient.multicall({ contracts, allowFailure: true });

  const out = {};
  addresses.forEach((address, i) => {
    const nameResult = results[i * 2];
    const symbolResult = results[i * 2 + 1];
    out[address.toLowerCase()] = {
      name: nameResult.status === "success" ? nameResult.result : null,
      symbol: symbolResult.status === "success" ? symbolResult.result : null,
    };
  });
  return out;
}

// metaURI() isn't indexed either (same reason -- no launcher event carries
// it), and is only worth fetching per-token (a detail-page concern, not a
// whole-list one).
export async function fetchTokenMetaUri(chain, address) {
  try {
    return await getPublicClient(chain).readContract({ address, abi: DUCK_TOKEN_ABI, functionName: "metaURI" });
  } catch {
    return null;
  }
}
