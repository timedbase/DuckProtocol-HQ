import "dotenv/config";
import { createPublicClient, http, defineChain, type PublicClient } from "viem";
import { ADDRESSES } from "./addresses.js";
import type { ChainSlug } from "./registry.js";

const RPC_ENV_VAR: Record<ChainSlug, string> = {
  robinhood: "ROBINHOOD_RPC_URL",
};

const NATIVE_CURRENCY: Record<ChainSlug, { name: string; symbol: string; decimals: number }> = {
  robinhood: { name: "Ether", symbol: "ETH", decimals: 18 },
};

// Lazy, unlike an eager singleton (which would throw at import time if
// ROBINHOOD_RPC_URL was missing) -- a missing env var should 502 only the
// routes that actually need RPC, not take the whole API down at boot.
// Memoized so the client is only ever built once. Kept as a per-chain map
// (not a bare singleton) purely so a future second chain doesn't mean
// rewriting this module's shape again.
const clients = new Map<ChainSlug, PublicClient>();

export function getPublicClient(chain: ChainSlug): PublicClient {
  const cached = clients.get(chain);
  if (cached) return cached;

  const envVar = RPC_ENV_VAR[chain];
  const rpcUrl = process.env[envVar];
  if (!rpcUrl) {
    throw new Error(`${envVar} is not set`);
  }

  const viemChain = defineChain({
    id: ADDRESSES[chain].chainId,
    name: chain,
    nativeCurrency: NATIVE_CURRENCY[chain],
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const client = createPublicClient({ chain: viemChain, transport: http(rpcUrl) }) as PublicClient;
  clients.set(chain, client);
  return client;
}
