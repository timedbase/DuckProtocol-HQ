import "dotenv/config";
import type { ChainSlug } from "../chain/registry.js";

const SUBGRAPH_URL_ENV_VAR: Record<ChainSlug, string> = {
  robinhood: "SUBGRAPH_URL",
};

// Default: the Goldsky "current" tag for the duck-protocol-rh subgraph, so
// a redeploy of the subgraph never needs this env var touched. Overridable
// via SUBGRAPH_URL for a pinned version or a different indexer.
const DEFAULT_SUBGRAPH_URL: Partial<Record<ChainSlug, string>> = {
  robinhood: "https://api.goldsky.com/api/public/project_cmhtxnzpqm81001w94ksmgira/subgraphs/duck-protocol-rh/current/gn",
};

export class SubgraphError extends Error {
  constructor(message: string, public readonly errors: unknown) {
    super(message);
  }
}

// Thin GraphQL POST helper -- no client library needed for a handful of
// fixed queries. Lazy and per-chain (unlike the old single-chain module,
// which threw at import time if SUBGRAPH_URL was missing): a missing
// ARC_SUBGRAPH_URL should 502 only the /arc routes that need it, not take
// the whole API down for Ink too. Throws SubgraphError on a GraphQL-level
// error response, or if the chain's URL isn't configured, so route handlers
// can just await this and let their own try/catch respond with a 502, same
// as any other upstream-dependency failure.
export async function querySubgraph<T>(chain: ChainSlug, query: string, variables?: Record<string, unknown>): Promise<T> {
  const envVar = SUBGRAPH_URL_ENV_VAR[chain];
  const url = process.env[envVar] || DEFAULT_SUBGRAPH_URL[chain];
  if (!url) {
    throw new SubgraphError(`${envVar} is not set`, null);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new SubgraphError(`subgraph request failed: ${res.status} ${res.statusText}`, null);
  }

  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (body.errors) {
    throw new SubgraphError("subgraph returned errors", body.errors);
  }
  if (body.data === undefined) {
    throw new SubgraphError("subgraph returned no data", null);
  }
  return body.data;
}
