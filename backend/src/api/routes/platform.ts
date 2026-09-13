import { Router } from "express";
import { getPublicClient } from "../../chain/client.js";
import { querySubgraph } from "../../subgraph/client.js";
import { ADDRESSES } from "../../chain/addresses.js";
import type { ChainSlug } from "../../chain/registry.js";
import {
  DUCK_BONDING_CURVE_ABI,
  DUCK_LAUNCHER_ABI,
  DUCK_CROWDFUND_ABI,
  DUCK_HOOK_ABI,
  DUCK_VAULT_FACTORY_ABI,
  DUCK_VAULT_CONFIG_ABI,
  DUCK_TOKEN_GOVERNOR_FACTORY_ABI,
} from "../../chain/abis.js";

const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";

type Abi = typeof DUCK_HOOK_ABI;

export default function createPlatformRouter(chain: ChainSlug) {
  const router = Router();
  const addr = ADDRESSES[chain];

  // Rarely-changing owner config, read live via RPC rather than indexed. One multicall per route.
  async function readAll(address: `0x${string}`, abi: Abi, names: string[], argsByName: Record<string, unknown[]> = {}) {
    const results = await getPublicClient(chain).multicall({
      contracts: names.map((functionName) => ({ address, abi, functionName, args: argsByName[functionName] })) as never,
      allowFailure: false,
    });
    return Object.fromEntries(names.map((n, i) => [n, results[i]])) as Record<string, unknown>;
  }
  const str = (v: unknown) => (typeof v === "bigint" ? v.toString() : v);

  router.get("/hook", async (_req, res) => {
    try {
      const r = await readAll(addr.DUCK_HOOK, DUCK_HOOK_ABI, [
        "owner", "platformWallet", "ctoFee", "HOOK_FEE_DEFAULT_BPS", "PLATFORM_FEE_BPS", "HOLDER_REWARD_BPS", "CLAIMER_REWARD_BPS",
      ]);
      res.json({
        address: addr.DUCK_HOOK,
        owner: r.owner,
        platformWallet: r.platformWallet,
        ctoFee: str(r.ctoFee),
        hookFeeDefaultBps: Number(r.HOOK_FEE_DEFAULT_BPS),
        platformFeeBps: Number(r.PLATFORM_FEE_BPS),
        holderRewardBps: Number(r.HOLDER_REWARD_BPS),
        claimerRewardBps: Number(r.CLAIMER_REWARD_BPS),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/curve", async (_req, res) => {
    try {
      const r = await readAll(addr.DUCK_BONDING_CURVE, DUCK_BONDING_CURVE_ABI as Abi, [
        "platformWallet", "platformToken", "creationFee", "v4PositionManager", "v4Singleton", "v4Hook", "universalRouter", "vaultFactory",
      ]);
      res.json({
        address: addr.DUCK_BONDING_CURVE,
        platformWallet: r.platformWallet,
        platformToken: r.platformToken,
        creationFee: str(r.creationFee),
        dex: { positionManager: r.v4PositionManager, singleton: r.v4Singleton, hook: r.v4Hook, universalRouter: r.universalRouter },
        vaultFactory: r.vaultFactory,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/launcher", async (_req, res) => {
    try {
      const r = await readAll(
        addr.DUCK_LAUNCHER, DUCK_LAUNCHER_ABI as Abi,
        ["platformWallet", "platformToken", "launchFee", "dexes", "universalRouter", "vaultFactory"],
        { dexes: [addr.V4_POSITION_MANAGER] }
      );
      const dex = r.dexes as readonly [string, string, boolean];
      res.json({
        address: addr.DUCK_LAUNCHER,
        platformWallet: r.platformWallet,
        platformToken: r.platformToken,
        launchFee: str(r.launchFee),
        // DexConfig is (singleton, hook, enabled), keyed by position manager.
        dex: { positionManager: addr.V4_POSITION_MANAGER, singleton: dex[0], hook: dex[1], enabled: dex[2], universalRouter: r.universalRouter },
        vaultFactory: r.vaultFactory,
        // launch() never checks quoteTokens[...] -- any token can be the quote asset.
        quoteTokenAllowlistEnforced: false,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/crowdfund", async (_req, res) => {
    try {
      const r = await readAll(addr.DUCK_CROWDFUND, DUCK_CROWDFUND_ABI as Abi, [
        "platformWallet", "platformToken", "campaignFee", "campaignDuration", "contributorBps", "lpBps", "universalRouter", "vaultFactory",
      ]);
      res.json({
        address: addr.DUCK_CROWDFUND,
        platformWallet: r.platformWallet,
        platformToken: r.platformToken,
        campaignFee: str(r.campaignFee),
        campaignDurationSeconds: Number(r.campaignDuration),
        contributorBps: Number(r.contributorBps),
        lpBps: Number(r.lpBps),
        universalRouter: r.universalRouter,
        vaultFactory: r.vaultFactory,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/vault-factory", async (_req, res) => {
    try {
      const r = await readAll(addr.DUCK_VAULT_FACTORY, DUCK_VAULT_FACTORY_ABI as Abi, ["owner", "config", "hook", "governorFactory"]);
      res.json({ address: addr.DUCK_VAULT_FACTORY, ...r });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Shared, owner-tunable risk parameters every per-token vault reads by reference.
  router.get("/vault-config", async (_req, res) => {
    const names = [
      "maxLtvBps", "liquidationThresholdBps", "liquidationBonusBps", "closeFactorBps", "maxBorrowerShareBps",
      "maxPoolDepthShareBps", "maxCirculatingShareBps", "maxUtilizationBps", "buybackBps",
    ];
    try {
      const r = await readAll(addr.DUCK_VAULT_CONFIG, DUCK_VAULT_CONFIG_ABI as Abi, names);
      res.json({ address: addr.DUCK_VAULT_CONFIG, ...Object.fromEntries(names.map((n) => [n, Number(r[n])])) });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/governor-factory", async (_req, res) => {
    try {
      const r = await readAll(addr.DUCK_TOKEN_GOVERNOR_FACTORY, DUCK_TOKEN_GOVERNOR_FACTORY_ABI as Abi, [
        "owner", "governorImpl", "timelockImpl", "defaultVotingDelay", "defaultVotingPeriod",
      ]);
      res.json({
        address: addr.DUCK_TOKEN_GOVERNOR_FACTORY,
        owner: r.owner,
        governorImpl: r.governorImpl,
        timelockImpl: r.timelockImpl,
        defaultVotingDelay: Number(r.defaultVotingDelay),
        defaultVotingPeriod: Number(r.defaultVotingPeriod),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // The curated quote tokens with each family's live allow-list status. The mappings aren't
  // enumerable on-chain, so only the curated candidates can be checked. Native ETH is always valid.
  router.get("/quote-tokens", async (req, res) => {
    const family = typeof req.query.family === "string" ? req.query.family.toLowerCase() : "curve";
    const [target, abi, functionName] =
      family === "launcher" ? [addr.DUCK_LAUNCHER, DUCK_LAUNCHER_ABI, "quoteTokens"]
      : family === "crowdfund" ? [addr.DUCK_CROWDFUND, DUCK_CROWDFUND_ABI, "quoteAssetAllowed"]
      : [addr.DUCK_BONDING_CURVE, DUCK_BONDING_CURVE_ABI, "quoteTokenAllowed"];

    try {
      const results = await getPublicClient(chain).multicall({
        contracts: addr.DEFAULT_QUOTE_TOKENS.map((t) => ({ address: target, abi, functionName, args: [t.address] })) as never,
        allowFailure: false,
      });
      res.json([
        { address: NATIVE_ADDRESS, symbol: addr.nativeSymbol, decimals: 18, allowed: true },
        ...addr.DEFAULT_QUOTE_TOKENS.map((t, i) => ({ ...t, allowed: results[i] as boolean })),
      ]);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Platform-wide activity over the last 24h: counts, USD volume as indexed by the subgraph (null
  // rows -- trades in a quote token with no reference price at trade time -- are skipped), and the
  // raw volume grouped by quote asset.
  router.get("/stats", async (_req, res) => {
    const cutoff24h = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

    try {
      type VolRow = { quoteAmount: string; volumeUSD: string | null; token: { quoteToken: string | null } };
      const data = await querySubgraph<{
        tokens: { id: string }[];
        trades: VolRow[];
        poolSwaps: VolRow[];
        contributions: { amount: string; campaign: { dexQuoteAsset: string } }[];
        vaultBorrows: { id: string }[];
        proposals: { id: string }[];
      }>(
        chain,
        `query PlatformStats($cutoff: BigInt!) {
          tokens(first: 1000, where: { createdAtTimestamp_gte: $cutoff }) { id }
          trades(first: 1000, where: { timestamp_gte: $cutoff }) { quoteAmount volumeUSD token { quoteToken } }
          poolSwaps(first: 1000, where: { timestamp_gte: $cutoff }) { quoteAmount volumeUSD token { quoteToken } }
          contributions(first: 1000, where: { timestamp_gte: $cutoff }) { amount campaign { dexQuoteAsset } }
          vaultBorrows(first: 1000, where: { timestamp_gte: $cutoff }) { id }
          proposals(first: 1000, where: { createdAtTimestamp_gte: $cutoff }) { id }
        }`,
        { cutoff: String(cutoff24h) }
      );

      const curated = (address: string | null | undefined) =>
        addr.DEFAULT_QUOTE_TOKENS.find((t) => t.address.toLowerCase() === (address || "").toLowerCase());
      function sumByQuote(rows: { amountRaw: string; quoteToken: string | null | undefined }[]) {
        const totals = new Map<string, number>();
        for (const row of rows) {
          const isNative = !row.quoteToken || row.quoteToken === NATIVE_ADDRESS;
          const match = curated(row.quoteToken);
          const symbol = isNative ? addr.nativeSymbol : match ? match.symbol : row.quoteToken!;
          const decimals = isNative ? 18 : match ? match.decimals : 18;
          totals.set(symbol, (totals.get(symbol) || 0) + Number(row.amountRaw) / 10 ** decimals);
        }
        return [...totals.entries()].map(([symbol, amount]) => ({ symbol, amount })).sort((a, b) => b.amount - a.amount);
      }

      const allTrades = [...data.trades, ...data.poolSwaps];
      res.json({
        launches24h: data.tokens.length,
        trades24h: allTrades.length,
        borrows24h: data.vaultBorrows.length,
        proposals24h: data.proposals.length,
        tradingVolumeUsd24h: allTrades.reduce((sum, t) => sum + (t.volumeUSD != null ? Number(t.volumeUSD) : 0), 0),
        tradingVolume24h: sumByQuote(allTrades.map((t) => ({ amountRaw: t.quoteAmount, quoteToken: t.token.quoteToken }))),
        contributionVolume24h: sumByQuote(data.contributions.map((c) => ({ amountRaw: c.amount, quoteToken: c.campaign.dexQuoteAsset }))),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
