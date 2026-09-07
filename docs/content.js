// Real DuckProtocol documentation content. Every mechanism, fee, parameter,
// address, and endpoint below is taken directly from the actual deployed
// contracts and backend/frontend source in this repo -- nothing here is
// aspirational or guessed. Where a number is owner/governance-tunable
// rather than immutable, the text says so explicitly.

const NAV = [
  {
    title: "Introduction",
    pages: [
      { id: "overview", title: "Overview" },
      { id: "supply", title: "Token supply & renouncement" },
    ],
  },
  {
    title: "Launch Families",
    pages: [
      { id: "bonding-curve", title: "Bonding Curve" },
      { id: "instant", title: "Instant" },
      { id: "crowdfund", title: "Crowdfund Raise" },
    ],
  },
  {
    title: "Core Contracts",
    pages: [
      { id: "hook", title: "DuckHookV4" },
      { id: "locker", title: "DuckLocker" },
      { id: "fees", title: "Fees & Supply Tiers" },
    ],
  },
  {
    title: "Lending & Governance",
    pages: [
      { id: "vault", title: "DuckVault (Lending)" },
      { id: "governance", title: "Governance" },
    ],
  },
  {
    title: "Pricing",
    pages: [
      { id: "pricing", title: "USD Pricing" },
    ],
  },
  {
    title: "Reference",
    pages: [
      { id: "api", title: "API Reference" },
      { id: "addresses", title: "Contract Addresses" },
    ],
  },
];

function addrRow(name, desc, addr) {
  return `<tr><td><strong>${name}</strong><br><span style="color:var(--mute);font-size:12px">${desc}</span></td>
    <td class="addr">${addr}<button class="copy-btn" data-copy="${addr}">Copy</button></td></tr>`;
}
function endpointRow(method, path, desc) {
  return `<tr><td><span class="method ${method.toLowerCase()}">${method}</span></td><td class="mono">${path}</td><td>${desc}</td></tr>`;
}

const PAGES = {

overview: {
  lede: "DuckProtocol is a token launchpad and lending stack on Robinhood Chain (chain id 4663) -- three independent ways to launch a token, each sharing the same fee hook, LP-lock vault, and lending/governance layer.",
  body: `
    <h2 id="three-families">Three launch families, one shared core</h2>
    <p>Every token launched through DuckProtocol -- regardless of which of the three families created it -- is an <strong>EIP-1167 minimal-proxy clone</strong> of one shared <code>DuckToken</code> implementation, trades through the same <a href="#/hook">DuckHookV4</a> once it reaches a real pool, and has its LP position locked forever in the same <a href="#/locker">DuckLocker</a>. The three families only differ in <em>how a token gets from zero to a tradeable pool</em>:</p>
    <table class="data">
      <tr><th>Family</th><th>Contract</th><th>How it reaches a pool</th></tr>
      <tr><td><a href="#/bonding-curve">Bonding Curve</a></td><td class="mono">DuckBondingCurve</td><td>Tradeable immediately on an internal curve; migrates into a fresh V4 pool once it hits a creator-set target</td></tr>
      <tr><td><a href="#/instant">Instant</a></td><td class="mono">DuckLauncher</td><td>One transaction mints the full supply straight into a real V4 pool -- no curve phase at all</td></tr>
      <tr><td><a href="#/crowdfund">Crowdfund Raise</a></td><td class="mono">DuckCrowdfund</td><td>Collects contributions toward a goal first; the pool is seeded only on a successful finalize</td></tr>
    </table>
    <h2 id="what-makes-it-different">What's structurally different here</h2>
    <ul>
      <li><strong>No oracle, ever, for launch parameters.</strong> Every target a creator sets (curve start/migration target, instant launch market cap, crowdfund goal) is a raw amount denominated in whatever quote asset they chose -- see <a href="#/pricing">USD Pricing</a> for how the app now lets creators type these in USD instead.</li>
      <li><strong>Launcher has no curated quote-token allow-list.</strong> Bonding Curve and Crowdfund stay restricted to a platform-curated set of quote assets; Instant accepts <em>any</em> ERC-20 (or native ETH) as the quote asset a creator chooses.</li>
      <li><strong>Every token gets its own lending market.</strong> A per-token <a href="#/vault">DuckVault</a> is cloned at creation time, funded by a creator-directed cut of protocol fees -- not user deposits.</li>
      <li><strong>Holders govern their own vault.</strong> Withdrawing a vault's reserves requires a passed, timelocked, on-chain vote among that token's own holders -- see <a href="#/governance">Governance</a>.</li>
    </ul>
    <div class="callout info">
      <div class="callout-title">🦆 Chain</div>
      <p>DuckProtocol is deployed on <strong>Robinhood Chain</strong> only (chain id <code>4663</code>). There is no multi-chain registry -- every address on this site is for that one chain.</p>
    </div>
  `,
},

supply: {
  lede: "Every token this platform has ever created is deflationary by default, with no owner switch and no upgrade path on the token contract itself.",
  body: `
    <h2 id="mint-once">Minted once, never again</h2>
    <p>All three families mint their token's <strong>full supply exactly once, at creation</strong>. None of the three token-contract paths (bonding curve, instant, crowdfund) exposes a mint function after deploy -- total supply can only ever go down from here, never up.</p>
    <h2 id="what-moves-it-down">The only thing that ever burns supply</h2>
    <p>The token-side half of <a href="#/locker">DuckLocker</a>'s pool fee is the one mechanism that reduces supply post-launch, and only for tokens that have reached a real V4 pool (migrated curve tokens, every Instant token, and successful Crowdfund raises). There is no owner-controlled burn switch anywhere in the stack.</p>
    <h2 id="fixed-supply-menu">A fixed menu, not a free-form number</h2>
    <p>A creator doesn't type an arbitrary total-supply number -- every family resolves a <code>supplyTier</code> index (0-6) against one shared, fixed menu:</p>
    <table class="data">
      <tr><th>Tier index</th><th>Supply</th></tr>
      <tr><td><code>0</code> (default)</td><td>1,000,000,000 (1B)</td></tr>
      <tr><td><code>1</code></td><td>10,000,000,000 (10B)</td></tr>
      <tr><td><code>2</code></td><td>100,000,000,000 (100B)</td></tr>
      <tr><td><code>3</code></td><td>1,000,000,000,000 (1T)</td></tr>
      <tr><td><code>4</code></td><td>10,000,000,000,000 (10T)</td></tr>
      <tr><td><code>5</code></td><td>100,000,000,000,000 (100T)</td></tr>
      <tr><td><code>6</code></td><td>1,000,000,000,000,000 (1Q)</td></tr>
    </table>
    <p>Each step is a uniform 10x, and tier <code>0</code> (1B) is what every family falls back to if a caller never sets the field -- an unset <code>uint8</code> is zero by construction, not a special case that had to be coded around.</p>
  `,
},

"bonding-curve": {
  lede: "Tradeable from the first block on an internal curve, then migrates permanently into a real Uniswap V4 pool once it clears a creator-set target.",
  body: `
    <h2 id="curve-phase">The curve phase</h2>
    <p>A creator sets a <strong>start target</strong> and a <strong>migration target</strong>, both denominated in their chosen quote asset (or in USD in the app's create form -- see <a href="#/pricing">USD Pricing</a>). Buyers trade directly against the contract's own bonding-curve math from the moment the token is created -- there is no pool yet, so every trade is a direct call to <code>DuckBondingCurve</code>, not a Uniswap swap.</p>
    <p>Bonding Curve tokens stay restricted to a <strong>platform-curated quote-asset list</strong> (see <a href="#/addresses">curated quote tokens</a>) -- this is one of the two families with an enforced allow-list; only <a href="#/instant">Instant</a> accepts an arbitrary quote token.</p>
    <h2 id="migration">Migration</h2>
    <p>Once the curve's raised amount reaches the migration target, the contract opens a real Uniswap V4 pool, mints a full-range LP position, and hands it to <a href="#/locker">DuckLocker</a> -- permanently. From that point on, the token trades exactly like an <a href="#/instant">Instant</a> token: real pool, real <a href="#/hook">DuckHookV4</a> fees, no more curve math.</p>
    <div class="callout info">
      <div class="callout-title">No sandwich risk on the raise itself</div>
      <p>Every buy on the curve pulls the quote asset directly (<code>transferFrom</code>) -- there is no pooled swap at any predictable point during the curve phase for an attacker to sandwich. Migration only ever wraps native ETH to WETH 1:1 (when the token is native-quoted); it never swaps.</p>
    </div>
    <h2 id="fee-split-curve">Fee split during the curve phase</h2>
    <p>Curve-phase trading carries its own fee, split between the creator and the platform, with the creator's half further split by that token's <code>vaultBps</code> choice into the token's own <a href="#/vault">DuckVault</a> -- see <a href="#/fees">Fees & Supply Tiers</a> for the exact split options.</p>
  `,
},

instant: {
  lede: "One transaction mints the full supply straight into a real Uniswap V4 pool. No curve phase, no curated quote-asset restriction.",
  body: `
    <h2 id="how-it-works">How it works</h2>
    <p>A creator picks a <strong>launch market cap</strong> (the virtual FDV the pool is seeded at) and a quote asset. In one transaction, <code>DuckLauncher</code> clones the token, mints its entire resolved <a href="#/supply">supply tier</a>, opens a Uniswap V4 pool, mints a full-range LP position sized to that market cap, and hands the position to <a href="#/locker">DuckLocker</a> -- all before the transaction returns. There is no pre-pool phase at all: the very first trade on an Instant token is already a real V4 swap through <a href="#/hook">DuckHookV4</a>.</p>
    <h2 id="permissionless-quote">The one family without a curated allow-list</h2>
    <p>Unlike Bonding Curve and Crowdfund, <strong>Instant accepts any ERC-20 (or native ETH) as the quote asset</strong> a creator chooses -- there is no on-chain allow-list check at launch time. This is deliberate: it's the family built for pairing against an already-liquid, real token a creator wants to launch against, not just the platform's own curated list.</p>
    <p>Because the quote token can be arbitrary, the backend prices it the same way it prices every curated token -- via a live, GeckoTerminal-backed lookup (see <a href="#/pricing">USD Pricing</a>) -- rather than assuming it's one of the known curated assets.</p>
    <div class="callout warn">
      <div class="callout-title">A malformed quote token can't brick the launch</div>
      <p>If a creator picks a quote token whose <code>decimals()</code> call reverts or returns garbage, the launch itself still succeeds -- only the token's optional lending-vault link is skipped as a best-effort step. Token deployment and pool creation never depend on that call succeeding.</p>
    </div>
  `,
},

crowdfund: {
  lede: "Collects contributions toward a goal in the campaign's own chosen quote asset. Nothing trades until a successful finalize seeds a real pool.",
  body: `
    <h2 id="raise-phase">The raise</h2>
    <p>A creator sets a funding <strong>goal</strong> and a deadline. The token deploys immediately, with its full supply minted straight into the raise contract and transfers disabled -- nothing is tradeable during the raise, and there is no price at all until it resolves.</p>
    <p>Contributions land <strong>directly in the campaign's own quote asset</strong> -- native ETH if the campaign is native-quoted, or a direct <code>transferFrom</code> pull if it's quoted in one of the platform's curated ERC-20 quote assets. Crowdfund stays curated the same way Bonding Curve does; it has no permissionless quote-token path.</p>
    <h2 id="on-success">On success</h2>
    <p>Once the goal is met, anyone can call <code>finalize()</code>: the raised funds (already in the correct quote asset -- never swapped) seed a real, two-sided Uniswap V4 pool, the LP position locks permanently in <a href="#/locker">DuckLocker</a>, and backers can claim their pro-rata share of the token supply. Escrowed supply is released at this exact moment, not before.</p>
    <h2 id="on-failure">On a missed goal</h2>
    <p>If the deadline passes without hitting the goal, the raise fails: no pool is ever seeded, and every contributor can claim a full refund, in the same asset they contributed, one claim per contributor.</p>
    <div class="callout info">
      <div class="callout-title">Why contributions never get swapped</div>
      <p>An earlier version of this contract collected native ETH regardless of the campaign's quote asset, then swapped the whole pot to the real quote asset at <code>finalize()</code> -- a large, fully predictable, zero-slippage-protected swap at a known block, a textbook sandwich target. It's fixed: contributions now arrive pre-denominated in the campaign's actual quote asset, so <code>finalize()</code> never swaps anything at all.</p>
    </div>
  `,
},

hook: {
  lede: "A single Uniswap V4 hook, attached to every pool from block one across all three families -- it enforces the anti-MEV window and skims the creator's fee before a sell settles.",
  body: `
    <h2 id="anti-mev">Anti-MEV</h2>
    <p>A buy and a sell from the <strong>same address in the same block</strong> reverts. This is the hook's baseline defense against same-block sandwich/wash patterns, enforced identically on every pool it's attached to.</p>
    <h2 id="creator-fee">The creator fee</h2>
    <p>DuckHookV4 skims a fee on <strong>sells only</strong> before the swap settles. This fee is the <em>only</em> stream that reaches a token's creator directly -- the pool's own trading fee (see <a href="#/locker">DuckLocker</a>) never does. By default the whole fee goes to the creator, split further by an optional fee-splits configuration and, separately, by that token's <code>vaultBps</code> choice into its own <a href="#/vault">DuckVault</a> -- see <a href="#/fees">Fees & Supply Tiers</a>.</p>
    <h2 id="cto">Change The Owner (CTO)</h2>
    <p>The hook tracks a <code>creator</code> field per pool that can be reassigned through an on-chain application/approval flow (<code>applyForCTO</code> / <code>approveCTO</code> / <code>rejectCTO</code>), gated by a flat native-currency fee paid immediately to the platform wallet (never escrowed). Approving a CTO reassigns both the hook's own creator field <em>and</em> that token's <a href="#/vault">DuckVault</a> creator in the same step -- a CTO never touches the vault's fund-moving path, only who can eventually propose a governance withdrawal.</p>
    <h2 id="fail-soft">Fail-soft by design</h2>
    <p>The hook is <strong>CREATE2-mined and non-upgradeable</strong> -- if any of its optional side-effects (like depositing a fee cut into a token's vault) could revert, that would brick every pool it's attached to, forever. The vault-cut deposit is wrapped in try/catch specifically so a future vault-side revert degrades to "creator keeps the full cut this time," never to "every sell on this pool now reverts."</p>
  `,
},

locker: {
  lede: "One vault holding every LP position the platform mints. Positions are full-range and permanent -- the contract exposes fee collection and nothing else.",
  body: `
    <h2 id="no-withdraw">No withdraw path, on purpose</h2>
    <p>DuckLocker has no function that can ever move a locked LP position out. Once a position is registered here (at migration, at Instant launch, or at a successful Crowdfund finalize), it stays -- full-range, forever. This is the mechanism behind every family's "LP locked forever" claim; it isn't a promise, it's the absence of a withdraw function.</p>
    <h2 id="pool-fee-split">The pool's own trading fee</h2>
    <p>Separately from <a href="#/hook">DuckHookV4</a>'s creator-fee sell-tax, every pool also earns Uniswap's own LP trading fee (1%, 200 tick spacing, the one fee/tick-spacing tier this platform ever mints at). <strong>This fee is 100% platform revenue on both sides</strong> -- it has no creator or vault split at all:</p>
    <ul>
      <li>The token side transfers straight to the platform wallet.</li>
      <li>The quote side does the same, with one special case: if the pool's quote side happens to equal the platform's own token, that side is bought back and burned instead of transferred.</li>
    </ul>
    <p>The creator/vault split lives entirely on the separate, sell-only <a href="#/hook">hook fee</a> stream -- never on this one.</p>
  `,
},

fees: {
  lede: "Every fee stream in the stack, and the fixed menus every launch resolves against -- supply tiers and the creator/vault split.",
  body: `
    <h2 id="creation-fees">Creation fees</h2>
    <p>Each family charges a flat, native-currency fee at deploy time -- never a percentage of anything raised or migrated. Read the live current value for your chain from <a href="#/api">the API</a> (<code>GET /:chain/curve</code>, <code>/launcher</code>, <code>/crowdfund</code>) rather than trusting a number hardcoded into a docs page that can drift from the real, owner-tunable value on chain.</p>
    <h2 id="trading-fees">Trading fees</h2>
    <table class="data">
      <tr><th>Phase</th><th>Fee</th><th>Goes to</th></tr>
      <tr><td>Curve phase (pre-migration)</td><td>Curve's own trading fee</td><td>Split creator / platform, creator's half further split by <code>vaultBps</code></td></tr>
      <tr><td>Real pool -- LP trading fee</td><td>1.00% (1% tier, 200 tick spacing)</td><td>100% platform (buy-side to wallet, sell-side to wallet or burned if quote == platform token)</td></tr>
      <tr><td>Real pool -- hook fee</td><td>Owner-tunable default, sells only</td><td>100% creator by default, split further by <code>vaultBps</code></td></tr>
    </table>
    <h2 id="vault-bps">The creator/vault split (<code>vaultBps</code>)</h2>
    <p>At creation, every family lets a creator choose one of exactly four fixed creator/vault splits for their token's <a href="#/hook">hook fee</a> stream. This choice is <strong>immutable after creation</strong> -- even a CTO can't touch it, since it's effectively a promise to the token's own future lenders.</p>
    <table class="data">
      <tr><th><code>vaultBps</code></th><th>Creator</th><th>Vault</th></tr>
      <tr><td><code>0</code></td><td>100%</td><td>0%</td></tr>
      <tr><td><code>1000</code></td><td>90%</td><td>10%</td></tr>
      <tr><td><code>5000</code></td><td>50%</td><td>50%</td></tr>
      <tr><td><code>10000</code></td><td>0%</td><td>100%</td></tr>
    </table>
    <p>The vault's share is what funds that specific token's own <a href="#/vault">lending market</a> -- there is no shared, cross-token pool of lending capital.</p>
  `,
},

vault: {
  lede: "Every token gets its own per-token lending market, funded by its vaultBps cut of protocol fees, not by user deposits.",
  body: `
    <h2 id="one-vault-per-token">One vault, one token, for life</h2>
    <p>A <code>DuckVault</code> is cloned once per token, at creation, for all three families uniformly -- it holds exactly one token's entire lending market, with the token contract itself storing a pointer to its own vault. Reserves grow only from that token's <code>vaultBps</code> fee cut and from accrued borrower interest -- never from a user "depositing" into it.</p>
    <h2 id="risk-parameters">Risk parameters</h2>
    <p>These live in a shared, owner-tunable <code>DuckVaultConfig</code> singleton -- every vault clone reads current values by reference, so a platform-wide parameter change is one transaction, not one per already-cloned vault. Current defaults:</p>
    <table class="data">
      <tr><th>Parameter</th><th>Default</th></tr>
      <tr><td>Max loan-to-value (LTV)</td><td>30%</td></tr>
      <tr><td>Liquidation threshold</td><td>75% LTV</td></tr>
      <tr><td>Liquidation bonus</td><td>8%</td></tr>
      <tr><td>Close factor (max repaid per liquidation)</td><td>50%</td></tr>
      <tr><td>Max single borrower's share of pool depth</td><td>20%</td></tr>
      <tr><td>Max single borrower's share of circulating supply</td><td>10%</td></tr>
      <tr><td>Buyback-and-burn cut of interest / cleared bad debt</td><td>20%</td></tr>
    </table>
    <h2 id="oracle">Pricing: a real TWAP, not spot price</h2>
    <p>The pool's own hook tracks a tick-cumulative TWAP (up to ~8 hours of coverage, committed at most once per 5 minutes so a burst of same-block swaps can't flush recent history right before a manipulation attempt). Borrowing undervalues collateral (uses the <em>lower</em> of a 30-minute and a 4-hour window); liquidation avoids reacting to a short wick (uses the <em>higher</em> of the two).</p>
    <h2 id="exposure-guards">Borrower-exposure guards</h2>
    <p>Two independent caps on <code>borrow()</code>, both fail-closed (revert, never silently degrade) when the data needed to check them can't be read:</p>
    <ul>
      <li><strong>Pool-depth cap</strong>: a loan's collateral value can't exceed 20% of the pool's real, live currency-side depth, computed from actual on-chain liquidity -- not from the vault's own reserves, which have no necessary relationship to how much the real AMM pool could absorb selling into.</li>
      <li><strong>Circulating-supply cap</strong>: a single borrower's posted collateral can't exceed 10% of circulating supply (total supply minus the dead-address balance).</li>
    </ul>
    <h2 id="liquidation">Liquidation</h2>
    <p>Permissionless, pays a bonus to whoever triggers it. A deeply underwater position clamps and socializes the shortfall against the vault's own reserves rather than reverting -- without that clamp, liquidation would revert on exactly the positions that most need it.</p>
    <h2 id="buyback">Buyback-and-burn</h2>
    <p>A configurable cut (default 20%) of the <em>interest</em> portion of every repayment, and of debt actually cleared (not written off) by every liquidation, is earmarked and permissionlessly swept: swapped for the vault's own token through the real pool and burned. Never a cut of principal.</p>
    <h2 id="upgradeability">Per-vault, governance-gated upgradeability</h2>
    <p>Each vault is deployed as its own upgradeable proxy. Upgrading requires <strong>both</strong> a passed, timelocked governance vote from that token's own holders <strong>and</strong> the new implementation being on a platform-approved registry -- closing off the risk that a captured vote alone could point a vault at arbitrary code. A token whose holders never propose an upgrade simply stays on its original implementation forever.</p>
  `,
},

governance: {
  lede: "Vault withdrawals are never a single-key action -- they require a passed, timelocked, on-chain vote among that specific token's own holders.",
  body: `
    <h2 id="voting-power">Voting power</h2>
    <p>Every token contract carries real, checkpointed voting balances (OpenZeppelin's <code>ERC20Votes</code>) -- each holder's own raw balance, snapshotted at proposal creation to close off flash-loan vote manipulation. <strong>Delegation is disabled entirely</strong>: a holder always votes their own balance, never someone else's.</p>
    <h2 id="proposing">Proposing is creator-only</h2>
    <p>Only that token's current creator can create a withdrawal proposal (amount + destination, both specified per-proposal). A governor contract is cloned lazily, on a token's first proposal -- a token that never uses governance never pays the deployment cost for it.</p>
    <h2 id="quorum">A double quorum</h2>
    <p>A proposal needs to clear <strong>two independent thresholds</strong>, not just one:</p>
    <table class="data">
      <tr><th>Threshold</th><th>Requirement</th></tr>
      <tr><td>Weighted (token-based)</td><td>FOR votes ≥ 40% of circulating supply at the proposal's snapshot block</td></tr>
      <tr><td>Headcount (participation-based)</td><td>Distinct holders who voted FOR or AGAINST ≥ 40% of eligible holders</td></tr>
    </table>
    <p>The headcount threshold only counts a vote when the voter's snapshotted weight was genuinely nonzero -- otherwise a horde of zero-balance addresses could trivially satisfy a headcount quorum with no real stake behind it. The dead/burn address is excluded from both sides of every ratio, consistently with how it's excluded from circulating supply everywhere else.</p>
    <h2 id="timelock">A 5-day timelock on every execution</h2>
    <p>Even a fully passed proposal can't execute immediately -- every governance action (a withdrawal, or a vault upgrade) sits behind a fixed, platform-wide <strong>5-day timelock</strong>, not owner-tunable. This is the real safety window: cancellation is only available while a proposal is still pending, before voting starts, so the timelock delay is what gives other holders time to react to a proposal they disagree with.</p>
    <div class="callout warn">
      <div class="callout-title">A known, flagged risk</div>
      <p>Because the bar is 40% of circulating supply (not of a small quorum) and the destination is per-proposal, a single holder or coordinated group controlling ≥40% of a token's circulating supply can, in principle, pass a self-serving withdrawal. The 5-day timelock is the mitigation: it gives other holders and borrowers a real window to react before funds move.</p>
    </div>
  `,
},

pricing: {
  lede: "Create-form inputs are typed in USD; the backend resolves the exact on-chain quote-asset amount. Market cap and volume on every card are shown in USD too.",
  body: `
    <h2 id="why">Why this exists</h2>
    <p>Every launch parameter -- a bonding curve's start/migration target, an Instant launch's market cap, a Crowdfund's goal -- is fundamentally a raw amount in whatever quote asset a creator picked. Typing "60000" when you mean 60,000 of a token you may not have an intuitive price for is a bad experience, so the app lets a creator type a USD amount instead, for all three families.</p>
    <h2 id="how-curated">Curated quote tokens: normalized by the subgraph</h2>
    <p>The subgraph tracks a clean, decimal-correct, quote-denominated price and volume series per token -- unifying curve-phase trades and real pool swaps into one consistent number, correctly handling each curated quote asset's own decimals (6 for USDG, 18 for everything else). This raw, normalized figure is what a one-multiplication USD conversion is applied to.</p>
    <h2 id="how-custom">Creator-provided quote tokens: priced live</h2>
    <p>Because <a href="#/instant">Instant</a> accepts any quote token, the backend can't rely on a fixed curated list to price it. Instead, a small backend price service (<code>chain/price.ts</code>) resolves <strong>any</strong> quote token's current USD price the same way, live, via GeckoTerminal's public API -- which indexes this chain's real DEX pools directly, so it works identically whether the address is one of the platform's curated tokens or an arbitrary creator-provided one.</p>
    <p>Prices are cached in-memory for ~90 seconds to avoid hammering a public, rate-limited API. A quote asset that genuinely can't be priced right now returns <code>null</code> -- never a fabricated number.</p>
    <h2 id="conversion">The actual conversion</h2>
    <p><code>POST /:chain/price/convert</code> takes a quote-token address and a USD amount, and returns the exact raw on-chain unit amount (computed with integer/fixed-point arithmetic, not naive floating-point division, to avoid rounding dust at 18-decimal precision) -- ready to pass straight into the on-chain create call. See <a href="#/api">API Reference</a>.</p>
    <h2 id="display">Market cap & volume display</h2>
    <p>The same live price feed is what lets Discover cards and the token page show <code>$</code>-denominated market cap and volume instead of "60,000 LINK" -- computed by multiplying the subgraph's raw, quote-denominated numbers by that quote asset's current USD price at request time.</p>
  `,
},

api: {
  lede: "Every route below is chain-scoped under /:chain (this chain's slug is robinhood) except /upload, which has nothing chain-specific about it.",
  body: `
    <h2 id="tokens">Tokens</h2>
    <table class="data">
      ${endpointRow("GET", "/:chain/tokens", "List tokens. Query: family, limit, offset.")}
      ${endpointRow("GET", "/:chain/tokens/:address", "Token detail, including its LP position and pool registration.")}
      ${endpointRow("GET", "/:chain/tokens/:address/trades", "Merged curve-phase + real pool-swap trade history.")}
      ${endpointRow("GET", "/:chain/tokens/:address/holders", "Holder list and count.")}
      ${endpointRow("GET", "/:chain/tokens/:address/comments", "Comment thread for a token.")}
      ${endpointRow("POST", "/:chain/tokens/:address/comments", "Post a comment.")}
    </table>
    <h2 id="campaigns">Campaigns</h2>
    <table class="data">
      ${endpointRow("GET", "/:chain/campaigns", "List crowdfund campaigns.")}
      ${endpointRow("GET", "/:chain/campaigns/:id", "Campaign detail, including contributions/claims/refunds.")}
    </table>
    <h2 id="pricing-endpoints">Pricing</h2>
    <table class="data">
      ${endpointRow("GET", "/:chain/price?tokens=addr1,addr2", "Batched current USD price per quote-token address.")}
      ${endpointRow("POST", "/:chain/price/convert", "Body: { quoteToken, usd }. Returns { raw, decimals, priceUsd }.")}
    </table>
    <h2 id="platform">Platform config &amp; stats</h2>
    <table class="data">
      ${endpointRow("GET", "/:chain/curve", "Live DuckBondingCurve config (creation fee, platform wallet, ...).")}
      ${endpointRow("GET", "/:chain/launcher", "Live DuckLauncher config.")}
      ${endpointRow("GET", "/:chain/crowdfund", "Live DuckCrowdfund config.")}
      ${endpointRow("GET", "/:chain/hook", "Live DuckHookV4 config (fee bps, CTO fee, ...).")}
      ${endpointRow("GET", "/:chain/locker", "Live DuckLocker config.")}
      ${endpointRow("GET", "/:chain/vault-factory", "Live DuckVaultFactory config.")}
      ${endpointRow("GET", "/:chain/vault-config", "Live DuckVaultConfig risk parameters.")}
      ${endpointRow("GET", "/:chain/governor-factory", "Live DuckTokenGovernorFactory config.")}
      ${endpointRow("GET", "/:chain/quote-tokens?family=", "Curated quote tokens, with live allow-list status per family.")}
      ${endpointRow("GET", "/:chain/stats", "Platform-wide activity, grouped by quote asset (never a fabricated USD total).")}
    </table>
    <h2 id="portfolio">Portfolio</h2>
    <table class="data">
      ${endpointRow("GET", "/:chain/portfolio/:address", "A wallet's created tokens, holdings, and claimable creator fees.")}
    </table>
    <h2 id="upload">Metadata upload</h2>
    <p>Unprefixed -- pinning metadata to IPFS has nothing chain-specific about it.</p>
    <table class="data">
      ${endpointRow("POST", "/upload/image", "Multipart field 'file'. Sniffs real image magic bytes before pinning. Returns { cid, ipfsUri, gatewayUrl }.")}
      ${endpointRow("POST", "/upload/metadata", "Body: { name, symbol, description, image, socials }. Returns { cid, ipfsUri, gatewayUrl }.")}
    </table>
    <div class="callout warn">
      <div class="callout-title">metaURI is permanent</div>
      <p>A token's <code>metaURI</code> is written on-chain at creation and the token's owner is renounced immediately at launch (Instant/Curve migration) or at deploy (Crowdfund) -- there is no owner-controlled path to change it afterward except the platform's own separate <code>DuckMetaOverride</code> registry. A failed <code>/upload/metadata</code> call must block submission entirely, never silently proceed with broken metadata.</p>
    </div>
  `,
},

addresses: {
  lede: "Real, deployed contract addresses for Robinhood Chain (chain id 4663). These don't change once deployed -- unlike fee parameters, which are owner/governance-tunable and better read live from the API.",
  body: `
    <h2 id="chain">Chain</h2>
    <table class="data">
      <tr><td>Name</td><td class="mono">Robinhood Chain</td></tr>
      <tr><td>Chain ID</td><td class="mono">4663</td></tr>
      <tr><td>RPC</td><td class="mono">https://rpc.mainnet.chain.robinhood.com</td></tr>
      <tr><td>Explorer</td><td class="mono"><a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer">robinhoodchain.blockscout.com ↗</a></td></tr>
    </table>
    <h2 id="core">Core contracts</h2>
    <table class="data">
      ${addrRow("DuckBondingCurve", "Bonding-curve family", "0x9AE7383af6ea77037c09459a9aF8f4AEC038f083")}
      ${addrRow("DuckBondingCurveViews", "Read-only curve pricing helper", "0x15b11099304Ceb93aA4Ee76fc4EA08c074F9401e")}
      ${addrRow("DuckLauncher", "Instant-launch family", "0xDA4fAD8E339d1F1f243C810CCDa29de80c5040Dc")}
      ${addrRow("DuckCrowdfund", "Crowdfund-raise family", "0x5066B217106De6f7b1A5F43eAa138C3C6306FC7d")}
      ${addrRow("DuckLocker", "LP-position vault", "0xbaA2A0F17922729F5Aa826ec5b0B927583260E03")}
      ${addrRow("DuckHookV4", "Shared Uniswap V4 hook", "0x2F030392B3472BbE30Dc36e960eFc226744140C4")}
    </table>
    <h2 id="lending-gov">Lending &amp; governance</h2>
    <table class="data">
      ${addrRow("DuckVaultFactory", "Per-token vault deployment + implementation registry", "0xeB191E04445046cDD3f21Bae6e79Ef78bE08D28F")}
      ${addrRow("DuckVaultConfig", "Shared, owner-tunable risk parameters", "0x74738a87e4D4E0eB2706724a9314d1b4452ecdFE")}
      ${addrRow("DuckTokenGovernorFactory", "Per-token governor + timelock deployment", "0x6A73DA9BC5Ecb8cCD4EccEBf53e3591B2cc30D0d")}
    </table>
    <h2 id="infra">Shared infrastructure</h2>
    <table class="data">
      ${addrRow("DuckToken impl.", "EIP-1167 clone template, shared by all three families", "0xCA544758ADc9Ab518185FB0784D79E4884ba5cB4")}
      ${addrRow("WETH", "Wrapped native ETH", "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73")}
      ${addrRow("Uniswap V4 PoolManager", "Shared V4 singleton", "0x8366a39CC670B4001A1121B8F6A443A643e40951")}
      ${addrRow("Uniswap V4 PositionManager", "Shared V4 singleton", "0x58daec3116aae6D93017bAAea7749052E8a04fA7")}
      ${addrRow("Uniswap V4 StateView", "Shared V4 singleton", "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b")}
      ${addrRow("Permit2", "Canonical Permit2 deployment", "0x000000000022D473030F116dDEE9F6B43aC78BA3")}
    </table>
    <h2 id="quote-tokens">Curated quote tokens</h2>
    <p>Bonding Curve and Crowdfund stay restricted to this list (plus native ETH) unless the platform owner adds more on-chain. Instant accepts any quote token beyond this list too -- see <a href="#/instant">Instant</a>.</p>
    <table class="data">
      ${addrRow("USDG", "6 decimals", "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168")}
      ${addrRow("LINK", "18 decimals", "0x492641F648a4986844848E0beFE66D14817bCE34")}
      ${addrRow("TAO", "18 decimals", "0xf3081494B87e8D5fb7960f066E931D1D0e6E3d67")}
      ${addrRow("PONS", "18 decimals", "0x39dBED3a2bd333467115dE45665cC57F813C4571")}
      ${addrRow("CASHCAT", "18 decimals", "0x020bfC650A365f8BB26819deAAbF3E21291018b4")}
      ${addrRow("INDEX", "18 decimals", "0x56910D4409F3a0C78C64DD8D0545FF0705389870")}
      ${addrRow("SPY", "18 decimals", "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C")}
      ${addrRow("NVDA", "18 decimals", "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC")}
      ${addrRow("TSLA", "18 decimals", "0x322F0929c4625eD5bAd873c95208D54E1c003b2d")}
      ${addrRow("SPCX", "18 decimals", "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa")}
      ${addrRow("AAPL", "18 decimals", "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9")}
    </table>
  `,
},

};

// Fold PAGES' bodies into the NAV entries so app.js has one flat lookup.
NAV.forEach((g) => g.pages.forEach((p) => Object.assign(p, PAGES[p.id])));
