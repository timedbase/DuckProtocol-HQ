import { Router } from "express";
import { getAddress, parseAbi, type Address } from "viem";
import { querySubgraph } from "../../subgraph/client.js";
import type { ChainSlug } from "../../chain/registry.js";
import { getPublicClient } from "../../chain/client.js";
import { ADDRESSES } from "../../chain/addresses.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const VAULT_ABI = parseAbi([
  "function totalReserves() view returns (uint128)",
  "function totalBorrows() view returns (uint128)",
  "function totalCollateral() view returns (uint128)",
  "function currencyDecimals() view returns (uint8)",
  "function healthFactorBps(address) view returns (uint256)",
  "function loans(address) view returns (uint128 collateral, uint128 principal, uint256 indexSnap, uint40 openedAt)",
  "function borrowIndex() view returns (uint256)",
]);
const ERC20_SYMBOL_ABI = parseAbi(["function symbol() view returns (string)"]);
// DuckHookV4.pools is a public mapping (bytes32 poolId -> PoolInfo), and
// PoolInfo carries vaultBps -- the one place it's readable uniformly across
// all three families (DuckBondingCurve/DuckLauncher/DuckCrowdfund each shape
// their own per-token config differently, and DuckLauncher doesn't persist
// one at all; every family's pool registration writes vaultBps here the
// same way). Only resolvable once a pool actually exists (poolId set).
const HOOK_POOLS_ABI = parseAbi([
  "function pools(bytes32) view returns (address token, address quoteCurrency, bool tokenIsCurrency0, address creator, uint256 launchTimestamp, bool registered, uint256 hookFeeBps, uint16 vaultBps)",
]);

type SubgraphVault = {
  id: string; token: { id: string; symbol: string | null; hook: string | null }; family: string; creator: string;
  governor: string | null; currency: string | null; poolId: string | null; enabled: boolean;
};

// Curated symbols are already known (chain/addresses.ts); anything else
// (a creator-provided custom quote token, same permissionless-launcher case
// price.ts already handles) gets a live on-chain symbol() read -- never a
// placeholder, matching how every other quote-asset display in this app
// resolves an unlisted symbol.
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

function currencyDecimalsFor(chain: ChainSlug, currency: string | null): number {
  if (!currency || currency.toLowerCase() === ZERO_ADDRESS) return 18;
  const curated = ADDRESSES[chain].DEFAULT_QUOTE_TOKENS.find((q) => q.address.toLowerCase() === currency.toLowerCase());
  return curated?.decimals ?? 18;
}

// A vault's live state (reserves/borrows/collateral) is only ever real
// on-chain right now -- the subgraph tracks per-event history (VaultDeposit/
// VaultBorrow/...), not a running-balance summary entity, so current totals
// come from the vault contract's own view functions, same as every other
// "current state" read in this backend (platform.ts's config routes).
async function summarizeVault(chain: ChainSlug, v: SubgraphVault) {
  const client = getPublicClient(chain);
  const vaultAddr = getAddress(v.id);
  const [totalReserves, totalBorrows, totalCollateral] = await Promise.all([
    client.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: "totalReserves" }).catch(() => 0n),
    client.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: "totalBorrows" }).catch(() => 0n),
    client.readContract({ address: vaultAddr, abi: VAULT_ABI, functionName: "totalCollateral" }).catch(() => 0n),
  ]);
  const currencySymbol = await currencySymbolFor(chain, v.currency);
  const currencyDecimals = currencyDecimalsFor(chain, v.currency);
  const reserves = Number(totalReserves) / 10 ** currencyDecimals;
  const borrows = Number(totalBorrows) / 10 ** currencyDecimals;
  const utilizationBps = reserves + borrows > 0 ? Math.round((borrows / (reserves + borrows)) * 10000) : 0;

  // Only resolvable once a real pool exists (poolId set) -- a pre-migration
  // curve token's vault has none yet, and is already shown as disabled in
  // the UI regardless, so null here is honest, not a gap.
  //
  // Must read off the SAME hook this token's pool actually registered
  // against, not a single global default -- a pool's hook is permanently
  // bound into its PoolKey at creation (Uniswap v4), so once more than one
  // DuckHookV4 exists (a new one deployed for a fee-model change, say), a
  // global constant would silently read the wrong contract for anything
  // still on an older hook. Token.hook (set by DuckLocker's
  // PositionRegistered handler, uniformly across all 3 families -- see
  // duck-locker.ts) is the real, per-token source of truth for this.
  let vaultBps: number | null = null;
  if (v.poolId) {
    try {
      const hookAddress = v.token.hook ? getAddress(v.token.hook) : ADDRESSES[chain].DUCK_HOOK;
      const pool = await client.readContract({ address: hookAddress, abi: HOOK_POOLS_ABI, functionName: "pools", args: [v.poolId as `0x${string}`] });
      vaultBps = pool[7];
    } catch {
      vaultBps = null;
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
    vaultBps,
  };
}

// Enumerating "which addresses have an open loan" has no on-chain view --
// the subgraph's VaultBorrow events are the only record of who has ever
// borrowed from this vault. Capped at 200 (matches this codebase's existing
// "revisit once this routinely hits it" tradeoff, e.g. tokens.ts's trade
// merge) -- fine at today's real usage volume.
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
        if (principal === 0n) return null; // fully repaid -- not an open position
        const debt = indexSnap > 0n ? (principal * borrowIndex) / indexSnap : principal;
        return { borrower: b, collateral: collateral.toString(), principal: principal.toString(), debt: debt.toString(), healthFactorBps: Number(healthFactorBps) };
      } catch {
        return null;
      }
    })
  );
  return loans.filter((l): l is NonNullable<typeof l> => l != null);
}

export default function createVaultsRouter(chain: ChainSlug) {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const data = await querySubgraph<{ vaults: SubgraphVault[] }>(
        chain,
        `query Vaults { vaults(first: 200, orderBy: createdAtBlock, orderDirection: desc) { id token { id symbol hook } family creator governor currency poolId enabled } }`
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
        `query VaultForToken($token: String!) { vaults(where: { token: $token }, first: 1) { id token { id symbol hook } family creator governor currency poolId enabled } }`,
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
