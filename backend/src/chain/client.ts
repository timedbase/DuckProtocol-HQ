import "dotenv/config";
import { createPublicClient, http, defineChain, type PublicClient } from "viem";
import { ADDRESSES } from "./addresses.js";
import type { ChainSlug } from "./registry.js";

const RPC_ENV_VAR: Record<ChainSlug, string> = {
  robinhood: "ROBINHOOD_RPC_URL",
  ink: "INK_RPC_URL",
};

// Lazy and memoized per chain. The env var overrides the chain's public RPC, which is only a
// fallback -- set a dedicated endpoint in production.
const clients = new Map<ChainSlug, PublicClient>();

export function getPublicClient(chain: ChainSlug): PublicClient {
  const cached = clients.get(chain);
  if (cached) return cached;

  const addr = ADDRESSES[chain];
  const rpcUrl = process.env[RPC_ENV_VAR[chain]] || addr.defaultRpcUrl;
  const viemChain = defineChain({
    id: addr.chainId,
    name: addr.name,
    nativeCurrency: { name: "Ether", symbol: addr.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  });

  const client = createPublicClient({ chain: viemChain, transport: http(rpcUrl) }) as PublicClient;
  clients.set(chain, client);
  return client;
}
