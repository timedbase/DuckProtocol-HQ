export type KeeperVault = {
  id: string; // vault address -- triggerBuyback target
  // token.id is the processBatch target; hook is the claimFees target -- per token, since a pool's
  // hook is bound into its PoolKey forever.
  token: { id: string; hook: string | null };
  poolId: string | null; // claimFees target
  enabled: boolean; // false until a real pool exists (pre-migration curve token, unfinalized crowdfund)
};

async function querySubgraph<T>(url: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`subgraph request failed: ${res.status} ${res.statusText}`);
  const body = (await res.json()) as { data?: T; errors?: unknown };
  if (body.errors) throw new Error(`subgraph returned errors: ${JSON.stringify(body.errors)}`);
  if (body.data === undefined) throw new Error("subgraph returned no data");
  return body.data;
}

const PAGE_SIZE = 500;

// Cursor-based on entity id rather than skip: the keeper has to see every vault that has ever
// existed, and skip-based pagination has a hard ceiling on most Graph indexers.
export async function fetchAllVaults(subgraphUrl: string): Promise<KeeperVault[]> {
  const all: KeeperVault[] = [];
  let lastId = "0x";
  for (;;) {
    const data = await querySubgraph<{ vaults: KeeperVault[] }>(
      subgraphUrl,
      `query Vaults($first: Int!, $lastId: Bytes!) {
        vaults(first: $first, where: { id_gt: $lastId }, orderBy: id, orderDirection: asc) {
          id
          token { id hook }
          poolId
          enabled
        }
      }`,
      { first: PAGE_SIZE, lastId }
    );
    all.push(...data.vaults);
    if (data.vaults.length < PAGE_SIZE) break;
    lastId = data.vaults[data.vaults.length - 1].id;
  }
  return all;
}
