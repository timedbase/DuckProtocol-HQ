import { querySubgraph } from "./subgraph/client.js";
import { CHAIN_SLUGS, type ChainSlug } from "./chain/registry.js";

// Polled occasionally in the background (see startHealthChecks), not on
// every /health request -- a real subgraph round-trip on every hit would
// make the health check itself a load-bearing, latency-adding dependency
// for every page's status bar. `_meta` is graph-node's own standard field
// (indexed block + indexing-error flag), the cheapest real signal of
// "is the subgraph itself up and caught up" available.
export type SubgraphHealth = {
  ok: boolean;
  latencyMs: number | null;
  blockNumber: string | null;
  hasIndexingErrors: boolean | null;
  checkedAt: number; // unix ms
  error?: string;
};

const NOT_CHECKED_YET: SubgraphHealth = {
  ok: false, latencyMs: null, blockNumber: null, hasIndexingErrors: null, checkedAt: 0,
};

const lastHealth: Record<ChainSlug, SubgraphHealth> = {
  robinhood: { ...NOT_CHECKED_YET },
};

export function getSubgraphHealth(): Record<ChainSlug, SubgraphHealth> {
  return lastHealth;
}

async function checkOne(chain: ChainSlug): Promise<void> {
  const start = Date.now();
  try {
    const data = await querySubgraph<{ _meta: { block: { number: string }; hasIndexingErrors: boolean } | null }>(
      chain,
      `{ _meta { block { number } hasIndexingErrors } }`
    );
    lastHealth[chain] = {
      ok: !data._meta?.hasIndexingErrors,
      latencyMs: Date.now() - start,
      blockNumber: data._meta?.block?.number ?? null,
      hasIndexingErrors: data._meta?.hasIndexingErrors ?? null,
      checkedAt: Date.now(),
    };
  } catch (err) {
    lastHealth[chain] = {
      ok: false,
      latencyMs: Date.now() - start,
      blockNumber: null,
      hasIndexingErrors: null,
      checkedAt: Date.now(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function checkSubgraphHealth(): Promise<void> {
  await Promise.all(CHAIN_SLUGS.map(checkOne));
}

export function startHealthChecks(intervalMs = 30_000): void {
  checkSubgraphHealth(); // so /health has a real reading immediately, not just after the first interval
  setInterval(checkSubgraphHealth, intervalMs);
}
