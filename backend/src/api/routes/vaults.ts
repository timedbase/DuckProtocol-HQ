import { Router } from "express";
import { getAddress, parseAbi, type Address } from "viem";
import { querySubgraph } from "../../subgraph/client.js";
import type { ChainSlug } from "../../chain/registry.js";
import { getPublicClient } from "../../chain/client.js";
import { ADDRESSES } from "../../chain/addresses.js";
import { getDecimals } from "../../chain/price.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const VAULT_ABI = parseAbi([
  "function totalReserves() view returns (uint128)",
  "function totalBorrows() view returns (uint128)",
  "function totalCollateral() view returns (uint128)",
  "function healthFactorBps(address) view returns (uint256)",
  "function loans(address) view returns (uint128 collateral, uint128 principal, uint256 indexSnap, uint40 openedAt)",
  "function borrowIndex() view returns (uint256)",
]);
const ERC20_SYMBOL_ABI = parseAbi(["function symbol() view returns (string)"]);
// DuckHookV4.pools(poolId) -> PoolInfo. The fee split (creator/vault/burn, summing to 10000) is
// fixed at pool registration and readable uniformly for all three families here.
const HOOK_POOLS_ABI = parseAbi([
  "function pools(bytes32) view returns (address token, address quoteCurrency, bool tokenIsCurrency0, address creator, uint256 launchTimestamp, bool registered, uint256 hookFeeBps, uint16 creatorBps, uint16 vaultBps, uint16 burnBps)",
]);

type SubgraphVault = {
  id: string; token: { id: string; symbol: string | null; hook: string | null }; family: string; creator: string;
  governor: string | null; currency: string | null; poolId: string | null; enabled: boolean;
};

async function currencySymbolFor(chain: ChainSlug, currency: string | null): Promise<string | null> {
  if (!currency) return null;
  if (currency.toLowerCase() === ZERO_ADDRESS) return ADDRESSES[chain].nativeSymbol;
  const curated = ADDRESSES[chain].DEFAULT_QUOTE_TOKENS.find((q) => q.address.toLowerCase() === currency.toLowerCase());
  if (curated) return curated.symbol;
  try {
    return await getPublicClient(chain).readContract({ address: getAddress(currency), abi: ERC20_SYMBOL_ABI, functionName: "symbol" });
  } catch {
    return null;
  }
}

// Live reserves/borrows/collateral come from the vault contract; the subgraph only tracks per-event
// history, not running balances.
async function summarizeVault(chain: ChainSlug, v: SubgraphVault) {
  const client = getPublicClient(chain);
  const vaultAddr = getAddress(v.id);
  const [totalReserves, totalBorrows, totalCollateral] = await Promise.all([
    client.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: "totalReserves" }).catch(() => 0n),
    client.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: "totalBorrows" }).catch(() => 0n),
    client.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: "totalCollateral" }).catch(() => 0n),
  ]);
  const currencySymbol = await currencySymbolFor(chain, v.currency);
  const currencyDecimals = v.currency ? (await getDecimals(chain, [v.currency])).get(v.currency) ?? 18 : 18;
  const reserves = Number(totalReserves) / 10 ** currencyDecimals;
  const borrows = Number(totalBorrows) / 10 ** currencyDecimals;
  const utilizationBps = reserves + borrows > 0 ? Math.round((borrows / (reserves + borrows)) * 10000) : 0;

  // Only resolvable once a pool exists. Read off the token's own hook: a pool's hook is bound into
  // its PoolKey forever, so a chain-wide default could point at the wrong contract.
  let split: { creatorBps: number; vaultBps: number; burnBps: number } | null = null;
  if (v.poolId) {
    try {
      const hookAddress = v.token.hook ? getAddress(v.token.hook) : ADDRESSES[chain].DUCK_HOOK;
      const pool = await client.readContract({ address: hookAddress, abi: HOOK_POOLS_ABI, functionName: "pools", args: [v.poolId as `0x${string}`] });
      split = { creatorBps: pool[7], vaultBps: pool[8], burnBps: pool[9] };
    } catch {
      split = null;
    }
  }

  return {
    token: { id: v.token.id, symbol: v.token.symbol },
    vault: v.id,
    enabled: v.enabled,
    currency: v.currency,
    currencySymbol,
    currencyDecimals,
    poolId: v.poolId,
    totalReserves: totalReserves.toString(),
    totalBorrows: totalBorrows.toString(),
    totalCollateral: totalCollateral.toString(),
    utilizationBps,
    creatorBps: split?.creatorBps ?? null,
    vaultBps: split?.vaultBps ?? null,
    burnBps: split?.burnBps ?? null,
  };
}

// VaultBorrow events are the only record of who has ever borrowed; capped at 200 borrowers.
async function loansFor(chain: ChainSlug, vaultAddr: Address) {
  const data = await querySubgraph<{ vaultBorrows: { borrower: string }[] }>(
    chain,
    `query VaultBorrowers($vault: String!) {
      vaultBorrows(where: { vault: $vault }, first: 200, orderBy: blockNumber, orderDirection: desc) { borrower }
    }`,
    { vault: vaultAddr.toLowerCase() }
  );
  const borrowers = [...new Set(data.vaultBorrows.map((b) => b.borrower.toLowerCase()))];
  if (borrowers.length === 0) return [];

  const client = getPublicClient(chain);
  const loans = await Promise.all(
    borrowers.map(async (borrower) => {
      try {
        const b = getAddress(borrower);
        const [loan, healthFactorBps, borrowIndex] = await Promise.all([
          client.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: "loans", args: [b] }),
          client.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: "healthFactorBps", args: [b] }),
          client.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: "borrowIndex" }),
        ]);
        const [collateral, principal, indexSnap] = loan;
        if (principal === 0n) return null;
        const debt = indexSnap > 0n ? (principal * borrowIndex) / indexSnap : principal;
        return { borrower: b, collateral: collateral.toString(), principal: principal.toString(), debt: debt.toString(), healthFactorBps: Number(healthFactorBps) };
      } catch {
        return null;
      }
    })
  );
  return loans.filter((l): l is NonNullable<typeof l> => l != null);
}

const VAULT_FIELDS = "id token { id symbol hook } family creator governor currency poolId enabled";

export default function createVaultsRouter(chain: ChainSlug) {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const data = await querySubgraph<{ vaults: SubgraphVault[] }>(
        chain,
        `query Vaults { vaults(first: 200, orderBy: createdAtBlock, orderDirection: desc) { ${VAULT_FIELDS} } }`
      );
      res.json(await Promise.all(data.vaults.map((v) => summarizeVault(chain, v))));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/:tokenAddress", async (req, res) => {
    const tokenAddress = req.params.tokenAddress.toLowerCase();
    try {
      const data = await querySubgraph<{ vaults: SubgraphVault[] }>(
        chain,
        `query VaultForToken($token: String!) { vaults(where: { token: $token }, first: 1) { ${VAULT_FIELDS} } }`,
        { token: tokenAddress }
      );
      const vault = data.vaults[0];
      if (!vault) return res.status(404).json({ error: "no vault for this token" });
      const [summary, loans] = await Promise.all([summarizeVault(chain, vault), loansFor(chain, getAddress(vault.id))]);
      res.json({ ...summary, loans });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
