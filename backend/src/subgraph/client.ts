import "dotenv/config";
import type { ChainSlug } from "../chain/registry.js";
import { ADDRESSES } from "../chain/addresses.js";

// Each chain defaults to the "current" Goldsky tag of its own subgraph (DuckSubgraph-RH /
// DuckSubgraph-Ink under ../subgraph), so a subgraph redeploy never needs these touched. The env
// vars pin a specific version or point at a different indexer.
const SUBGRAPH_URL_ENV_VAR: Record<ChainSlug, string> = {
  robinhood: "ROBINHOOD_SUBGRAPH_URL",
  ink: "INK_SUBGRAPH_URL",
};

export class SubgraphError extends Error {
  constructor(message: string, public readonly errors: unknown) {
    super(message);
  }
}

// Thin GraphQL POST helper. Throws SubgraphError on an HTTP or GraphQL-level error so route
// handlers can let their own try/catch respond with a 502.
export async function querySubgraph<T>(chain: ChainSlug, query: string, variables?: Record<string, unknown>): Promise<T> {
  const url = process.env[SUBGRAPH_URL_ENV_VAR[chain]] || ADDRESSES[chain].defaultSubgraphUrl;

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
