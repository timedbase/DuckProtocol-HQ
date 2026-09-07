import { Router } from "express";
import { getPublicClient } from "../../chain/client.js";
import { querySubgraph } from "../../subgraph/client.js";
import { ADDRESSES } from "../../chain/addresses.js";
import type { ChainSlug } from "../../chain/registry.js";
import {
  DUCK_BONDING_CURVE_ABI,
  DUCK_LAUNCHER_ABI,
  DUCK_CROWDFUND_ABI,
  DUCK_LOCKER_ABI,
  DUCK_HOOK_ABI,
  DUCK_VAULT_FACTORY_ABI,
  DUCK_VAULT_CONFIG_ABI,
  DUCK_TOKEN_GOVERNOR_FACTORY_ABI,
} from "../../chain/abis.js";

const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";

export default function createPlatformRouter(chain: ChainSlug) {
  const router = Router();
  const addr = ADDRESSES[chain];

  // Rarely-changing owner config, read live via RPC rather than indexed --
  // a handful of cheap eth_call reads, fine to do per-request without
  // caching at this traffic volume; add caching here first if that ever
  // stops being true.

  router.get("/locker", async (_req, res) => {
    try {
      const publicClient = getPublicClient(chain);
      const [owner, platformWallet, platformToken] = await Promise.all([
        publicClient.readContract({ address: addr.DUCK_LOCKER, abi: DUCK_LOCKER_ABI, functionName: "owner" }),
        publicClient.readContract({ address: addr.DUCK_LOCKER, abi: DUCK_LOCKER_ABI, functionName: "platformWallet" }),
        publicClient.readContract({ address: addr.DUCK_LOCKER, abi: DUCK_LOCKER_ABI, functionName: "platformToken" }),
      ]);
      res.json({ address: addr.DUCK_LOCKER, owner, platformWallet, platformToken });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/hook", async (_req, res) => {
    try {
      const publicClient = getPublicClient(chain);
      const [owner, platformWallet, ctoFee] = await Promise.all([
        publicClient.readContract({ address: addr.DUCK_HOOK, abi: DUCK_HOOK_ABI, functionName: "owner" }),
        publicClient.readContract({ address: addr.DUCK_HOOK, abi: DUCK_HOOK_ABI, functionName: "platformWallet" }),
        publicClient.readContract({ address: addr.DUCK_HOOK, abi: DUCK_HOOK_ABI, functionName: "ctoFee" }),
      ]);
      res.json({ address: addr.DUCK_HOOK, owner, platformWallet, ctoFee: (ctoFee as bigint).toString() });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/curve", async (_req, res) => {
    try {
      const publicClient = getPublicClient(chain);
      const [platformWallet, platformToken, creationFee, v4PositionManager, v4Singleton, v4Permit2, v4Hook, vaultFactory] = await Promise.all([
        publicClient.readContract({ address: addr.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "platformWallet" }),
        publicClient.readContract({ address: addr.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "platformToken" }),
        publicClient.readContract({ address: addr.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "creationFee" }),
        publicClient.readContract({ address: addr.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "v4PositionManager" }),
        publicClient.readContract({ address: addr.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "v4Singleton" }),
        publicClient.readContract({ address: addr.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "v4Permit2" }),
        publicClient.readContract({ address: addr.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "v4Hook" }),
        publicClient.readContract({ address: addr.DUCK_BONDING_CURVE, abi: DUCK_BONDING_CURVE_ABI, functionName: "vaultFactory" }),
      ]) as [unknown, unknown, bigint, unknown, unknown, unknown, unknown, unknown];
      res.json({
        address: addr.DUCK_BONDING_CURVE,
        platformWallet,
        platformToken,
        creationFee: creationFee.toString(),
        dex: { positionManager: v4PositionManager, singleton: v4Singleton, permit2: v4Permit2, hook: v4Hook },
        vaultFactory,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/launcher", async (_req, res) => {
    try {
      const publicClient = getPublicClient(chain);
      const [platformWallet, platformToken, launchFee, dex, vaultFactory] = await Promise.all([
        publicClient.readContract({ address: addr.DUCK_LAUNCHER, abi: DUCK_LAUNCHER_ABI, functionName: "platformWallet" }),
        publicClient.readContract({ address: addr.DUCK_LAUNCHER, abi: DUCK_LAUNCHER_ABI, functionName: "platformToken" }),
        publicClient.readContract({ address: addr.DUCK_LAUNCHER, abi: DUCK_LAUNCHER_ABI, functionName: "launchFee" }),
        publicClient.readContract({
          address: addr.DUCK_LAUNCHER,
          abi: DUCK_LAUNCHER_ABI,
          functionName: "dexes",
          args: [addr.V4_POSITION_MANAGER],
        }),
        publicClient.readContract({ address: addr.DUCK_LAUNCHER, abi: DUCK_LAUNCHER_ABI, functionName: "vaultFactory" }),
      ]) as [unknown, unknown, bigint, readonly [string, string, string, boolean], unknown];
      res.json({
        address: addr.DUCK_LAUNCHER,
        platformWallet,
        platformToken,
        launchFee: launchFee.toString(),
        // (singleton, permit2, hook, enabled) -- see DuckLauncher.sol's DexConfig struct.
        dex: { positionManager: addr.V4_POSITION_MANAGER, singleton: dex[0], permit2: dex[1], hook: dex[2], enabled: dex[3] },
        vaultFactory,
        // No allow-list check gates launch() for quote token choice here --
        // unlike curve/crowdfund. See DuckLauncher.sol's _setupAndRegister.
        quoteTokenAllowlistEnforced: false,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/crowdfund", async (_req, res) => {
    try {
      const publicClient = getPublicClient(chain);
      const [platformWallet, platformToken, campaignFee, campaignDuration, contributorBps, lpBps, vaultFactory] = await Promise.all([
        publicClient.readContract({ address: addr.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "platformWallet" }),
        publicClient.readContract({ address: addr.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "platformToken" }),
        publicClient.readContract({ address: addr.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "campaignFee" }),
        publicClient.readContract({ address: addr.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "campaignDuration" }),
        publicClient.readContract({ address: addr.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "contributorBps" }),
        publicClient.readContract({ address: addr.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "lpBps" }),
        publicClient.readContract({ address: addr.DUCK_CROWDFUND, abi: DUCK_CROWDFUND_ABI, functionName: "vaultFactory" }),
      ]) as [unknown, unknown, bigint, bigint, bigint, bigint, unknown];
      res.json({
        address: addr.DUCK_CROWDFUND,
        platformWallet,
        platformToken,
        campaignFee: campaignFee.toString(),
        campaignDurationSeconds: Number(campaignDuration),
        contributorBps: Number(contributorBps),
        lpBps: Number(lpBps),
        vaultFactory,
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/vault-factory", async (_req, res) => {
    try {
      const publicClient = getPublicClient(chain);
      const [owner, config, hook, governorFactory] = await Promise.all([
        publicClient.readContract({ address: addr.DUCK_VAULT_FACTORY, abi: DUCK_VAULT_FACTORY_ABI, functionName: "owner" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_FACTORY, abi: DUCK_VAULT_FACTORY_ABI, functionName: "config" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_FACTORY, abi: DUCK_VAULT_FACTORY_ABI, functionName: "hook" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_FACTORY, abi: DUCK_VAULT_FACTORY_ABI, functionName: "governorFactory" }),
      ]);
      res.json({ address: addr.DUCK_VAULT_FACTORY, owner, config, hook, governorFactory });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Shared, owner-tunable risk parameters every per-token vault reads by
  // reference (see lending/DuckVaultConfig.sol) -- the borrow/liquidation
  // pages need these to render real LTV/threshold/bonus figures, not
  // hardcoded copies that could drift from the live contract.
  router.get("/vault-config", async (_req, res) => {
    try {
      const publicClient = getPublicClient(chain);
      const [maxLtvBps, liquidationThresholdBps, liquidationBonusBps, closeFactorBps, maxBorrowerShareBps, maxPoolDepthShareBps, maxCirculatingShareBps, maxUtilizationBps, buybackBps] = await Promise.all([
        publicClient.readContract({ address: addr.DUCK_VAULT_CONFIG, abi: DUCK_VAULT_CONFIG_ABI, functionName: "maxLtvBps" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_CONFIG, abi: DUCK_VAULT_CONFIG_ABI, functionName: "liquidationThresholdBps" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_CONFIG, abi: DUCK_VAULT_CONFIG_ABI, functionName: "liquidationBonusBps" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_CONFIG, abi: DUCK_VAULT_CONFIG_ABI, functionName: "closeFactorBps" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_CONFIG, abi: DUCK_VAULT_CONFIG_ABI, functionName: "maxBorrowerShareBps" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_CONFIG, abi: DUCK_VAULT_CONFIG_ABI, functionName: "maxPoolDepthShareBps" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_CONFIG, abi: DUCK_VAULT_CONFIG_ABI, functionName: "maxCirculatingShareBps" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_CONFIG, abi: DUCK_VAULT_CONFIG_ABI, functionName: "maxUtilizationBps" }),
        publicClient.readContract({ address: addr.DUCK_VAULT_CONFIG, abi: DUCK_VAULT_CONFIG_ABI, functionName: "buybackBps" }),
      ]);
      res.json({
        address: addr.DUCK_VAULT_CONFIG,
        maxLtvBps: Number(maxLtvBps),
        liquidationThresholdBps: Number(liquidationThresholdBps),
        liquidationBonusBps: Number(liquidationBonusBps),
        closeFactorBps: Number(closeFactorBps),
        maxBorrowerShareBps: Number(maxBorrowerShareBps),
        maxPoolDepthShareBps: Number(maxPoolDepthShareBps),
        maxCirculatingShareBps: Number(maxCirculatingShareBps),
        maxUtilizationBps: Number(maxUtilizationBps),
        buybackBps: Number(buybackBps),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/governor-factory", async (_req, res) => {
    try {
      const publicClient = getPublicClient(chain);
      const [owner, governorImpl, timelockImpl, defaultVotingDelay, defaultVotingPeriod] = await Promise.all([
        publicClient.readContract({ address: addr.DUCK_TOKEN_GOVERNOR_FACTORY, abi: DUCK_TOKEN_GOVERNOR_FACTORY_ABI, functionName: "owner" }),
        publicClient.readContract({ address: addr.DUCK_TOKEN_GOVERNOR_FACTORY, abi: DUCK_TOKEN_GOVERNOR_FACTORY_ABI, functionName: "governorImpl" }),
        publicClient.readContract({ address: addr.DUCK_TOKEN_GOVERNOR_FACTORY, abi: DUCK_TOKEN_GOVERNOR_FACTORY_ABI, functionName: "timelockImpl" }),
        publicClient.readContract({ address: addr.DUCK_TOKEN_GOVERNOR_FACTORY, abi: DUCK_TOKEN_GOVERNOR_FACTORY_ABI, functionName: "defaultVotingDelay" }),
        publicClient.readContract({ address: addr.DUCK_TOKEN_GOVERNOR_FACTORY, abi: DUCK_TOKEN_GOVERNOR_FACTORY_ABI, functionName: "defaultVotingPeriod" }),
      ]);
      res.json({
        address: addr.DUCK_TOKEN_GOVERNOR_FACTORY,
        owner,
        governorImpl,
        timelockImpl,
        defaultVotingDelay: Number(defaultVotingDelay as bigint),
        defaultVotingPeriod: Number(defaultVotingPeriod as bigint),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Native currency is always a valid quote asset for curve/crowdfund (no
  // whitelist check applies to address(0)) -- included here so a frontend
  // doesn't need to special-case it separately from the ERC20 list. Launcher
  // has no allow-list at all (see /launcher's quoteTokenAllowlistEnforced),
  // so its list is just the curated defaults marked allowed=true without a
  // live on-chain check.
  router.get("/quote-tokens", async (req, res) => {
    const family = typeof req.query.family === "string" ? req.query.family.toLowerCase() : "curve";

    if (family === "launcher") {
      res.json([
        { address: NATIVE_ADDRESS, symbol: addr.nativeSymbol, allowed: true },
        ...addr.DEFAULT_QUOTE_TOKENS.map((t) => ({ address: t.address, symbol: t.symbol, allowed: true })),
      ]);
      return;
    }

    const target = family === "crowdfund" ? addr.DUCK_CROWDFUND : addr.DUCK_BONDING_CURVE;
    const abi = family === "crowdfund" ? DUCK_CROWDFUND_ABI : DUCK_BONDING_CURVE_ABI;
    const functionName = family === "crowdfund" ? "quoteAssetAllowed" : "quoteTokenAllowed";

    try {
      const publicClient = getPublicClient(chain);
      const results = await Promise.all(
        addr.DEFAULT_QUOTE_TOKENS.map((t) =>
          publicClient.readContract({ address: target, abi, functionName, args: [t.address] } as never)
        )
      );
      const tokens = [
        { address: NATIVE_ADDRESS, symbol: addr.nativeSymbol, allowed: true },
        ...addr.DEFAULT_QUOTE_TOKENS.map((t, i) => ({ address: t.address, symbol: t.symbol, allowed: results[i] as boolean })),
      ];
      res.json(tokens);
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Platform-wide activity aggregates. NOT ported from the legacy
  // launchpad's /stats: that route summed a `volumeUsd` field the legacy
  // subgraph resolved via an on-chain price oracle path this subgraph does
  // not build (see DuckProtocol-RH/schema.graphql -- Trade/Contribution/
  // VaultBorrow etc. all carry raw on-chain amounts, denominated in each
  // token's own quote asset, never a resolved USD figure). Reporting a
  // fabricated USD total by assuming a stablecoin peg for every quote asset
  // (including LINK/TAO/PONS/CASHCAT/INDEX/tokenized-stock quotes, none of
  // which are $1-pegged) would be actively misleading. This reports real
  // counts plus quote-asset-grouped raw volume instead -- same pattern the
  // legacy route already used for creatorFeesPaid/platformRevenue.
  router.get("/stats", async (_req, res) => {
    const now = Math.floor(Date.now() / 1000);
    const cutoff24h = now - 24 * 60 * 60;

    try {
      const data = await querySubgraph<{
        tokens: { id: string; family: string; createdAtTimestamp: string; quoteToken: string | null }[];
        trades: { id: string; quoteAmount: string; token: { quoteToken: string | null } }[];
        contributions: { id: string; amount: string; campaign: { dexQuoteAsset: string } }[];
        vaultBorrows: { id: string }[];
        proposals: { id: string }[];
      }>(
        chain,
        `query PlatformStats($cutoff: BigInt!) {
          tokens(first: 1000, where: { createdAtTimestamp_gte: $cutoff }) { id family createdAtTimestamp quoteToken }
          trades(first: 1000, where: { timestamp_gte: $cutoff }) { id quoteAmount token { quoteToken } }
          contributions(first: 1000, where: { timestamp_gte: $cutoff }) { id amount campaign { dexQuoteAsset } }
          vaultBorrows(first: 1000, where: { timestamp_gte: $cutoff }) { id }
          proposals(first: 1000, where: { createdAtTimestamp_gte: $cutoff }) { id }
        }`,
        { cutoff: String(cutoff24h) }
      );

      function quoteSymbol(address: string | null | undefined) {
        if (!address || address === NATIVE_ADDRESS) return addr.nativeSymbol;
        const match = addr.DEFAULT_QUOTE_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
        return match ? match.symbol : address;
      }
      function quoteDecimals(address: string | null | undefined) {
        if (!address || address === NATIVE_ADDRESS) return 18;
        const match = addr.DEFAULT_QUOTE_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
        return match ? match.decimals : 18;
      }
      function sumByQuote(rows: { amountRaw: string; quoteToken: string | null | undefined }[]) {
        const totals = new Map<string, number>();
        for (const row of rows) {
          const symbol = quoteSymbol(row.quoteToken);
          const amount = Number(row.amountRaw) / 10 ** quoteDecimals(row.quoteToken);
          totals.set(symbol, (totals.get(symbol) || 0) + amount);
        }
        return [...totals.entries()].map(([symbol, amount]) => ({ symbol, amount })).sort((a, b) => b.amount - a.amount);
      }

      res.json({
        launches24h: data.tokens.length,
        trades24h: data.trades.length,
        borrows24h: data.vaultBorrows.length,
        proposals24h: data.proposals.length,
        tradingVolume24h: sumByQuote(data.trades.map((t) => ({ amountRaw: t.quoteAmount, quoteToken: t.token.quoteToken }))),
        contributionVolume24h: sumByQuote(data.contributions.map((c) => ({ amountRaw: c.amount, quoteToken: c.campaign.dexQuoteAsset }))),
      });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
