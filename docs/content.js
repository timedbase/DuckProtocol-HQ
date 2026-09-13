// DuckProtocol documentation content. Every mechanism, fee, parameter, address, and endpoint below
// is taken from the deployed contracts (DuckProtocol/) and this repo's backend/frontend source.
// Where a number is owner/governance-tunable rather than fixed, the text says so.

const NAV = [
  {
    title: "Introduction",
    pages: [
      { id: "overview", title: "Overview" },
      { id: "supply", title: "Token supply & burns" },
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
    title: "Core Mechanics",
    pages: [
      { id: "hook", title: "DuckHookV4" },
      { id: "liquidity", title: "Locked liquidity" },
      { id: "holder-rewards", title: "Holder rewards" },
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
    title: "Integrate",
    pages: [
      { id: "integrate", title: "Quickstart" },
      { id: "integrate-launch", title: "Launching tokens" },
      { id: "integrate-trade", title: "Trading" },
      { id: "integrate-data", title: "Reading data & events" },
      { id: "integrate-fees", title: "Fees, rewards & errors" },
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
function quoteRows(tokens) {
  return tokens.map(([symbol, decimals, addr]) => addrRow(symbol, `${decimals} decimals`, addr)).join("");
}

const PAGES = {

overview: {
  lede: "DuckProtocol is a token launchpad and lending stack on Robinhood Chain (4663) and Ink (57073) -- three independent ways to launch a token, all sharing the same fee hook, holder rewards, and per-token lending and governance.",
  body: `
    <h2 id="three-families">Three launch families, one shared core</h2>
    <p>Every token launched through DuckProtocol is an <strong>EIP-1167 minimal-proxy clone</strong> of one shared <code>DuckToken</code> implementation, trades through <a href="#/hook">DuckHookV4</a> once it has a pool, and sits on <a href="#/liquidity">full-range liquidity that can never be removed</a>. The families only differ in <em>how a token gets from zero to a tradeable pool</em>:</p>
    <table class="data">
      <tr><th>Family</th><th>Contract</th><th>How it reaches a pool</th></tr>
      <tr><td><a href="#/bonding-curve">Bonding Curve</a></td><td class="mono">DuckBondingCurve</td><td>Tradeable immediately on an internal curve; migrates into a Uniswap V4 pool at a creator-set target</td></tr>
      <tr><td><a href="#/instant">Instant</a></td><td class="mono">DuckLauncher</td><td>One transaction mints the supply straight into a V4 pool -- no curve phase</td></tr>
      <tr><td><a href="#/crowdfund">Crowdfund Raise</a></td><td class="mono">DuckCrowdfund</td><td>Collects contributions toward a goal; the pool is seeded only on a successful finalize</td></tr>
    </table>
    <h2 id="what-makes-it-different">What's structurally different here</h2>
    <ul>
      <li><strong>No oracle for launch parameters.</strong> Every target a creator sets is a raw amount in their chosen quote asset. The app lets creators type these in USD and converts them at submit time -- see <a href="#/pricing">USD Pricing</a>.</li>
      <li><strong>One trading fee, shared out on claim.</strong> Pools have no LP fee. The hook's own fee is split between the platform, the token's holders, and the creator's chosen creator / vault / burn mix -- see <a href="#/fees">Fees</a>.</li>
      <li><strong>Holders get paid.</strong> 5% of every claimed fee funds a 12-hour, time-weighted reward round for the token's holders -- see <a href="#/holder-rewards">Holder rewards</a>.</li>
      <li><strong>Built to integrate.</strong> Every action is a permissionless contract call, and a public REST API serves token, trade and price data for both chains -- see the <a href="#/integrate">integration quickstart</a> and <a href="llms.txt">llms.txt</a>.</li>
      <li><strong>Every token gets its own lending market</strong>, funded by its vault share of fees, and governed by its own holders -- see <a href="#/vault">DuckVault</a> and <a href="#/governance">Governance</a>.</li>
    </ul>
    <div class="callout info">
      <div class="callout-title">🦆 Two chains, one set of addresses</div>
      <p>The protocol was deployed with CREATE2 from the same deployer on <strong>Robinhood Chain</strong> and <strong>Ink</strong>, so every DuckProtocol address is identical on both -- except <code>DuckHookV4</code>, whose address depends on the chain's PoolManager. Tokens, pools and vaults are separate per chain. See <a href="#/addresses">Contract Addresses</a>.</p>
    </div>
  `,
},

supply: {
  lede: "Every token's supply is minted once at creation and can only go down afterwards.",
  body: `
    <h2 id="mint-once">Minted once, never again</h2>
    <p>All three families mint a token's <strong>full supply exactly once, at creation</strong>. No token exposes a mint function after deploy.</p>
    <h2 id="what-moves-it-down">What burns supply</h2>
    <ul>
      <li><strong>The burn share of trading fees.</strong> A creator can route part (or all) of their fee share to buy-and-burn: on each fee claim the hook swaps that share of the quote currency for the token through its own pool and sends it to the dead address.</li>
      <li><strong>Vault buybacks.</strong> A cut of each vault's interest and cleared bad debt buys the token back and burns it -- see <a href="#/vault">DuckVault</a>.</li>
    </ul>
    <p>There is no owner-controlled burn or mint switch anywhere in the stack.</p>
    <h2 id="fixed-supply-menu">A fixed menu, not a free-form number</h2>
    <p>Every family resolves a <code>supplyTier</code> index (0-6) against one shared menu:</p>
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
  `,
},

"bonding-curve": {
  lede: "Tradeable from the first block on an internal curve, then migrates permanently into a Uniswap V4 pool once it clears a creator-set target.",
  body: `
    <h2 id="curve-phase">The curve phase</h2>
    <p>A creator sets a <strong>start target</strong> and a <strong>migration target</strong> in their chosen quote asset (or in USD in the app -- see <a href="#/pricing">USD Pricing</a>). Buyers trade directly against <code>DuckBondingCurve</code>'s curve math; there's no pool yet.</p>
    <p>Until migration the token's transfers are locked to the curve contract itself: holders can buy from and sell to the curve, but can't send the token wallet-to-wallet. Migration unlocks transfers permanently.</p>
    <p>Curve trades carry a <strong>1% curve fee</strong>, accrued per token and claimable by the creator (split with the platform) once the token has migrated.</p>
    <p>The quote asset must be on the chain's curated allow-list (native ETH is always allowed). Every curated token has native-ETH swap routes configured, so buyers holding only ETH can still buy an ERC-20-quoted curve token through <code>buyWithNative</code>.</p>
    <h2 id="migration">Migration</h2>
    <p>When the raised amount reaches the migration target, the contract opens a Uniswap V4 pool (fee tier 0, tick spacing 200), registers it with <a href="#/hook">DuckHookV4</a>, and adds full-range liquidity it has no way to remove -- see <a href="#/liquidity">Locked liquidity</a>. From then on the token trades like an <a href="#/instant">Instant</a> token.</p>
    <div class="callout info">
      <div class="callout-title">No sandwich window during the raise</div>
      <p>Curve buys pull the quote asset directly -- there's no pooled swap at a predictable point for an attacker to sandwich. Migration only wraps native ETH to WETH when needed; it never swaps.</p>
    </div>
  `,
},

instant: {
  lede: "One transaction mints the supply straight into a Uniswap V4 pool. No curve phase, and any token can be the quote asset.",
  body: `
    <h2 id="how-it-works">How it works</h2>
    <p>A creator picks a <strong>launch market cap</strong> (the virtual FDV the pool opens at) and a quote asset. In one transaction <code>DuckLauncher</code> clones the token, mints its <a href="#/supply">supply tier</a>, opens a V4 pool, registers it with <a href="#/hook">DuckHookV4</a>, and adds full-range liquidity sized to that market cap. The first trade is already a real V4 swap.</p>
    <p>An optional instant buy can ride along in the same transaction, paid in native ETH and routed into the quote asset first when the quote asset has configured routes.</p>
    <h2 id="permissionless-quote">Any quote token</h2>
    <p><code>launch()</code> doesn't check a quote-token allow-list, so <strong>any ERC-20 (or native ETH)</strong> can be the quote asset. An arbitrary quote token gets its own Uniswap reference pool discovered automatically, so its trades can still be valued in USD -- see <a href="#/pricing">USD Pricing</a>.</p>
    <div class="callout warn">
      <div class="callout-title">A malformed quote token can't brick the launch</div>
      <p>If a quote token's <code>decimals()</code> call reverts or returns garbage, the launch still succeeds -- only the token's optional lending-vault link is skipped.</p>
    </div>
  `,
},

crowdfund: {
  lede: "Collects contributions toward a goal in the campaign's own quote asset. Nothing trades until a successful finalize seeds a pool.",
  body: `
    <h2 id="raise-phase">The raise</h2>
    <p>A creator sets a <strong>goal</strong>; the deadline is a platform setting. The token deploys immediately with its full supply held by the raise contract -- nothing is tradeable during the raise, and there's no price until it resolves.</p>
    <p>Contributions land <strong>directly in the campaign's quote asset</strong> -- native ETH, or a curated ERC-20 pulled with <code>transferFrom</code>. Crowdfund quote assets are curated, like Bonding Curve.</p>
    <h2 id="on-success">On success</h2>
    <p>Once the goal is met and the deadline passes, anyone can call <code>finalize()</code>: the raised funds seed a two-sided V4 pool with full-range liquidity that can never be removed, and backers claim their pro-rata share of the contributor supply.</p>
    <h2 id="on-failure">On a missed goal</h2>
    <p>No pool is seeded, and every contributor can claim a full refund in the asset they contributed, once.</p>
    <div class="callout info">
      <div class="callout-title">Why contributions never get swapped</div>
      <p>Collecting one asset and swapping the whole pot at <code>finalize()</code> would be a large, predictable swap at a known time -- a sandwich target. Contributions arrive already in the campaign's quote asset, so <code>finalize()</code> never swaps.</p>
    </div>
  `,
},

hook: {
  lede: "One Uniswap V4 hook per chain, attached to every pool across all three families. It takes the trading fee, blocks same-block repeat swaps, and pays out fees on claim.",
  body: `
    <h2 id="trading-fee">The trading fee</h2>
    <p>The hook takes its fee <strong>in the quote currency on every buy and every sell</strong> -- on buys from the quote amount going in, on sells from the quote amount coming out. The creator picks the rate at launch from a fixed menu: <strong>2%, 4%, 6%, 8% or 10%</strong> (2% is the default). Fees accrue per pool in <code>accruedFees(poolId)</code>.</p>
    <h2 id="claiming">Claiming fees</h2>
    <p><code>claimFees(poolId)</code> is permissionless -- anyone can call it, and the protocol's keeper calls it on a schedule. Each claim splits the accrued amount:</p>
    <table class="data">
      <tr><th>Share</th><th>Goes to</th></tr>
      <tr><td>25%</td><td>Platform wallet. When someone other than the pool's creator calls <code>claimFees</code>, 1% of the total goes to that caller instead, out of the platform's share.</td></tr>
      <tr><td>5%</td><td>The token's <a href="#/holder-rewards">holder-reward round</a></td></tr>
      <tr><td>Remaining 70%</td><td>Split by the pool's <code>creatorBps / vaultBps / burnBps</code>: creator wallet (or its fee splits), the token's <a href="#/vault">DuckVault</a>, and buy-and-burn</td></tr>
    </table>
    <p>The creator/vault/burn split is fixed when the pool registers. Only the creator's own portion can be further routed with <code>setFeeSplits</code> (up to 5 wallets).</p>
    <h2 id="same-block">Same-block swap guard</h2>
    <p>A second swap on the same pool from the same transaction origin in the same block reverts (<code>SameBlockSwap</code>) -- a baseline defense against same-block sandwich and wash patterns.</p>
    <h2 id="cto">Community takeover (CTO)</h2>
    <p>Anyone can apply to take over a pool's creator role with <code>applyForCTO</code>, paying a flat native fee (owner-tunable, 0.1 ETH at deploy) straight to the platform wallet. The owner approves or rejects. Approval moves the hook's creator field and, best-effort, the token's vault creator -- it never touches supply, the pool, or liquidity.</p>
    <h2 id="fail-soft">Fail-soft by design</h2>
    <p>The hook is CREATE2-mined and non-upgradeable. Optional side-effects on claim -- the holder-reward deposit and the vault deposit -- are wrapped so a failure falls back to paying the creator, never to a claim that reverts forever.</p>
  `,
},

liquidity: {
  lede: "Every pool's liquidity is full-range and permanent. There is no LP position NFT to withdraw and no LP fee.",
  body: `
    <h2 id="no-withdraw">No remove-liquidity path</h2>
    <p>When a pool is created (at migration, at an Instant launch, or at a successful Crowdfund finalize), the launch contract adds full-range liquidity to the Uniswap V4 PoolManager <strong>as itself</strong>. None of the three contracts has a function that removes liquidity, so the liquidity stays for the life of the pool. "LP locked forever" is the absence of a withdraw path, not a promise.</p>
    <h2 id="pool-shape">Pool shape</h2>
    <table class="data">
      <tr><th>Parameter</th><th>Value</th></tr>
      <tr><td>Fee tier</td><td><code>0</code> -- liquidity earns no LP fee</td></tr>
      <tr><td>Tick spacing</td><td><code>200</code></td></tr>
      <tr><td>Range</td><td>Full range</td></tr>
      <tr><td>Hook</td><td>The chain's <code>DuckHookV4</code>, bound into the PoolKey forever</td></tr>
    </table>
    <p>Because the pool fee tier is 0, the <a href="#/hook">hook's trading fee</a> is the only fee a trader pays.</p>
  `,
},

"holder-rewards": {
  lede: "5% of every claimed trading fee is paid out to the token's holders every 12 hours, weighted by how long they held.",
  body: `
    <h2 id="funding">Funding</h2>
    <p>On every <code>claimFees</code>, the hook deposits 5% of the claimed amount into the token's current reward round, in the pool's quote currency.</p>
    <h2 id="rounds">Rounds and weighting</h2>
    <p>Rewards accrue in <strong>12-hour rounds</strong>. Each holder's share of a round is proportional to their <strong>time-weighted balance</strong> over it (balance × seconds held), so buying right before a round closes earns almost nothing.</p>
    <h2 id="eligibility">Eligibility</h2>
    <ul>
      <li>A holder needs at least <strong>0.25% of total supply</strong> when their payout is processed.</li>
      <li>The dead address, the Uniswap PoolManager (which holds every pool's reserves), and any contract address are excluded.</li>
    </ul>
    <h2 id="payouts">Payouts</h2>
    <p>Rewards are pushed directly to holders' wallets by <code>processBatch()</code>, up to 500 holders per call, resuming where the last call stopped. It's permissionless and isn't run inside ordinary transfers; the protocol's keeper calls it on a schedule.</p>
  `,
},

fees: {
  lede: "Every fee in the stack, and the fixed menus every launch resolves against.",
  body: `
    <h2 id="creation-fees">Creation fees</h2>
    <p>Each family charges a flat native-ETH fee at deploy time (0.0005 ETH at deploy, owner-tunable). Read the live value from <a href="#/api">the API</a> (<code>GET /:chain/curve</code>, <code>/launcher</code>, <code>/crowdfund</code>).</p>
    <h2 id="trading-fees">Trading fees</h2>
    <table class="data">
      <tr><th>Phase</th><th>Fee</th><th>Goes to</th></tr>
      <tr><td>Curve phase (pre-migration)</td><td>1% of each curve trade</td><td>Split creator / platform, claimable after migration</td></tr>
      <tr><td>Pool -- LP fee</td><td>None (fee tier 0)</td><td>—</td></tr>
      <tr><td>Pool -- hook fee</td><td>2 / 4 / 6 / 8 / 10%, creator's choice, on buys and sells</td><td>25% platform (1% of it to a non-creator claimer), 5% holders, 70% creator / vault / burn</td></tr>
    </table>
    <h2 id="fee-split">The creator / vault / burn split</h2>
    <p>At creation, every family takes <code>creatorBps</code>, <code>vaultBps</code> and <code>burnBps</code>, which must sum to exactly <code>10000</code>. They divide the 70% of each claimed hook fee that's left after the platform and holder shares, and are <strong>fixed once the pool registers</strong> -- even a CTO can't change them. The app offers these presets:</p>
    <table class="data">
      <tr><th>Creator</th><th>Vault</th><th>Burn</th></tr>
      <tr><td>100%</td><td>0%</td><td>0%</td></tr>
      <tr><td>80%</td><td>20%</td><td>0%</td></tr>
      <tr><td>50%</td><td>50%</td><td>0%</td></tr>
      <tr><td>50%</td><td>25%</td><td>25%</td></tr>
      <tr><td>50%</td><td>0%</td><td>50%</td></tr>
      <tr><td>0%</td><td>100%</td><td>0%</td></tr>
      <tr><td>0%</td><td>50%</td><td>50%</td></tr>
      <tr><td>0%</td><td>0%</td><td>100%</td></tr>
    </table>
    <p>The vault share funds that token's own <a href="#/vault">lending market</a>; the burn share buys the token back through its pool and burns it.</p>
  `,
},

vault: {
  lede: "Every token gets its own lending market, funded by its vault share of trading fees, not by user deposits.",
  body: `
    <h2 id="one-vault-per-token">One vault, one token, for life</h2>
    <p>A <code>DuckVault</code> is created once per token, at creation, for all three families -- it holds exactly one token's lending market, and becomes usable once the token has a pool. Reserves grow only from that token's <code>vaultBps</code> fee share and accrued borrower interest. The vault's currency is the pool's quote asset (WETH for a native-quoted pool).</p>
    <h2 id="risk-parameters">Risk parameters</h2>
    <p>These live in a shared, owner-tunable <code>DuckVaultConfig</code> -- every vault reads current values by reference. Defaults at deploy:</p>
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
    <p>Read live values from <code>GET /:chain/vault-config</code>.</p>
    <h2 id="oracle">Pricing: a TWAP, not spot price</h2>
    <p>The hook tracks a tick-cumulative TWAP per pool. Borrowing values collateral at the <em>lower</em> of a 30-minute and a 4-hour window; liquidation uses the <em>higher</em> of the two, so a short wick doesn't trigger it.</p>
    <h2 id="exposure-guards">Borrower-exposure guards</h2>
    <ul>
      <li><strong>Pool-depth cap</strong>: a loan's collateral value can't exceed 20% of the pool's live currency-side depth.</li>
      <li><strong>Circulating-supply cap</strong>: one borrower's collateral can't exceed 10% of circulating supply.</li>
    </ul>
    <p>Both fail closed -- if the data can't be read, <code>borrow()</code> reverts.</p>
    <h2 id="liquidation">Liquidation</h2>
    <p>Permissionless, with a bonus for the liquidator. A deeply underwater position clamps and socializes the shortfall against reserves rather than reverting.</p>
    <h2 id="buyback">Buyback-and-burn</h2>
    <p>A cut (default 20%) of the interest in every repayment, and of debt cleared by liquidations, is queued and swept by the permissionless <code>triggerBuyback()</code>: swapped for the vault's token and burned. Never a cut of principal.</p>
    <h2 id="upgradeability">Governance-gated upgrades</h2>
    <p>Each vault is its own upgradeable proxy. An upgrade needs both a passed, timelocked vote from that token's holders <strong>and</strong> an implementation on the platform's approved registry.</p>
  `,
},

governance: {
  lede: "Vault withdrawals are never a single-key action -- they need a passed, timelocked vote among that token's own holders.",
  body: `
    <h2 id="voting-power">Voting power</h2>
    <p>Every token carries checkpointed voting balances (<code>ERC20Votes</code>), snapshotted at proposal creation to close off flash-loan votes. <strong>Delegation is disabled</strong>: a holder always votes their own balance.</p>
    <h2 id="proposing">Proposing is creator-only</h2>
    <p>Only the token's current creator can propose a withdrawal (amount and destination per proposal). The governor and timelock are cloned lazily, on the first proposal.</p>
    <h2 id="quorum">A double quorum</h2>
    <table class="data">
      <tr><th>Threshold</th><th>Requirement</th></tr>
      <tr><td>Weighted</td><td>FOR votes ≥ 40% of circulating supply at the snapshot block</td></tr>
      <tr><td>Headcount</td><td>Distinct holders voting FOR or AGAINST ≥ 40% of eligible holders</td></tr>
    </table>
    <p>Only votes with nonzero snapshotted weight count toward headcount. The dead address is excluded from circulating supply.</p>
    <h2 id="timelock">A 5-day timelock</h2>
    <p>Every passed action waits behind a fixed <strong>5-day timelock</strong> before it can execute, giving other holders and borrowers time to react.</p>
    <div class="callout warn">
      <div class="callout-title">A known risk</div>
      <p>A holder or group controlling ≥40% of circulating supply could, in principle, pass a self-serving withdrawal. The 5-day timelock is the mitigation.</p>
    </div>
  `,
},

pricing: {
  lede: "Every trade is valued in USD at its quote token's reference price at the moment it happened.",
  body: `
    <h2 id="reference-prices">Reference prices</h2>
    <ul>
      <li><strong>Stablecoins are $1.</strong> USDG and U on Robinhood Chain; USDT0, USDC.e and USDG on Ink.</li>
      <li><strong>ETH</strong> is priced from the chain's ETH/stablecoin Uniswap pools, weighted by in-range liquidity.</li>
      <li><strong>Curated quote tokens</strong> (BTC, stocks, TAO, ...) are priced from reference pools chosen by a liquidity scan, against ETH or a stablecoin.</li>
      <li><strong>Any other quote token</strong> (an arbitrary Instant quote) -- the first time it's used, its Uniswap v3/v4 pools are looked up against ETH and the stablecoins and adopts one as its reference, retrying every 6 hours if none exists yet.</li>
    </ul>
    <p>A trade in a quote token with no reference price has no USD value -- shown in quote units rather than a guessed dollar figure.</p>
    <h2 id="tracked">What's tracked in USD</h2>
    <p>Per token: <code>lastPriceUSD</code>, <code>marketCapUSD</code> and <code>volumeUSDAllTime</code>; per hour: <code>volumeUSD</code> and <code>closePriceUSD</code>; per trade: <code>priceUSD</code> and <code>volumeUSD</code>. Discover cards and token pages read these directly.</p>
    <h2 id="conversion">Creating in USD</h2>
    <p>Launch parameters (curve targets, Instant market cap, Crowdfund goal) are raw quote-asset amounts on-chain. The create form takes USD, and at submit time <code>POST /:chain/price/convert</code> turns it into exact raw units using the same reference price, with fixed-point integer arithmetic. If the quote asset can't be priced, the conversion fails rather than sending a wrong amount.</p>
  `,
},

api: {
  lede: "Every data route is chain-scoped under /:chain -- robinhood or ink. /upload and /health are unprefixed.",
  body: `
    <h2 id="tokens">Tokens</h2>
    <table class="data">
      ${endpointRow("GET", "/:chain/tokens", "List tokens with USD price, market cap and volume. Query: family, limit, offset.")}
      ${endpointRow("GET", "/:chain/tokens/:address", "Token detail, including its pool registration.")}
      ${endpointRow("GET", "/:chain/tokens/:address/trades", "Merged curve-phase trades and pool swaps.")}
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
      ${endpointRow("GET", "/:chain/price?tokens=addr1,addr2", "Current USD reference price per quote-token address.")}
      ${endpointRow("POST", "/:chain/price/convert", "Body: { quoteToken, usd }. Returns { raw, decimals, priceUsd }.")}
    </table>
    <h2 id="platform">Platform config &amp; stats</h2>
    <table class="data">
      ${endpointRow("GET", "/:chain/curve", "Live DuckBondingCurve config (creation fee, DEX wiring, ...).")}
      ${endpointRow("GET", "/:chain/launcher", "Live DuckLauncher config.")}
      ${endpointRow("GET", "/:chain/crowdfund", "Live DuckCrowdfund config.")}
      ${endpointRow("GET", "/:chain/hook", "Live DuckHookV4 config (CTO fee, fee shares, ...).")}
      ${endpointRow("GET", "/:chain/vault-factory", "Live DuckVaultFactory config.")}
      ${endpointRow("GET", "/:chain/vault-config", "Live DuckVaultConfig risk parameters.")}
      ${endpointRow("GET", "/:chain/governor-factory", "Live DuckTokenGovernorFactory config.")}
      ${endpointRow("GET", "/:chain/quote-tokens?family=", "Curated quote tokens with live allow-list status per family.")}
      ${endpointRow("GET", "/:chain/stats", "Last-24h activity: counts, USD volume, and raw volume by quote asset.")}
    </table>
    <h2 id="lending">Lending &amp; governance</h2>
    <table class="data">
      ${endpointRow("GET", "/:chain/vaults", "Every vault with live reserves, borrows and fee split.")}
      ${endpointRow("GET", "/:chain/vaults/:token", "One token's vault, including open loans.")}
      ${endpointRow("GET", "/:chain/governance/proposals?token=", "Proposals with live state and quorum progress.")}
      ${endpointRow("GET", "/:chain/governance/proposals/:id", "One proposal.")}
    </table>
    <h2 id="portfolio">Portfolio</h2>
    <table class="data">
      ${endpointRow("GET", "/:chain/portfolio/:address", "A wallet's created tokens, holdings, and contributions.")}
    </table>
    <h2 id="upload">Metadata upload</h2>
    <table class="data">
      ${endpointRow("POST", "/upload/image", "Multipart field 'file'. Checks image magic bytes before pinning. Returns { cid, ipfsUri, gatewayUrl }.")}
      ${endpointRow("POST", "/upload/metadata", "Body: { name, symbol, description, image, socials }. Returns { cid, ipfsUri, gatewayUrl }.")}
    </table>
    <div class="callout warn">
      <div class="callout-title">metaURI is permanent</div>
      <p>A token's <code>metaURI</code> is written on-chain at creation and ownership is renounced -- it can't be changed afterwards. A failed <code>/upload/metadata</code> call must block submission.</p>
    </div>
  `,
},

integrate: {
  lede: "Everything you need to build on DuckProtocol: a launch button in your app, a trading bot, an aggregator route, or a dashboard.",
  body: `
    <h2 id="what-you-can-build">What you can build</h2>
    <ul>
      <li><strong>Launch tokens</strong> from your own app or bot through any of the three families -- see <a href="#/integrate-launch">Launching tokens</a>.</li>
      <li><strong>Trade</strong> curve tokens against the curve, and pool tokens through Uniswap V4 -- see <a href="#/integrate-trade">Trading</a>.</li>
      <li><strong>Read</strong> tokens, trades, holders, prices and campaigns from the REST API, or listen to contract events -- see <a href="#/integrate-data">Reading data &amp; events</a>.</li>
      <li><strong>Automate</strong> fee claims and holder-reward payouts, which pay the caller -- see <a href="#/integrate-fees">Fees, rewards &amp; errors</a>.</li>
    </ul>
    <h2 id="chains">Chains</h2>
    <table class="data">
      <tr><th></th><th>Robinhood Chain</th><th>Ink</th></tr>
      <tr><td>Chain ID</td><td class="mono">4663</td><td class="mono">57073</td></tr>
      <tr><td>API prefix</td><td class="mono">/robinhood</td><td class="mono">/ink</td></tr>
      <tr><td>Native currency</td><td>ETH</td><td>ETH</td></tr>
    </table>
    <p>DuckProtocol's own contracts share one address on both chains; the hook, WETH and Uniswap contracts differ. Full list: <a href="#/addresses">Contract Addresses</a>.</p>
    <h2 id="checklist">Integration checklist</h2>
    <table class="data">
      <tr><th>Need</th><th>Where</th></tr>
      <tr><td>Contract addresses</td><td><a href="#/addresses">Contract Addresses</a></td></tr>
      <tr><td>ABIs</td><td>The Duck-Protocol repository build output: <code>deploy/out/&lt;Contract&gt;.sol/&lt;Contract&gt;.json</code> (the <code>abi</code> field)</td></tr>
      <tr><td>REST API</td><td><code>https://api.duckfun.family</code> -- see <a href="#/api">API Reference</a></td></tr>
      <tr><td>Machine-readable summary</td><td><a href="llms.txt">llms.txt</a></td></tr>
    </table>
    <h2 id="conventions">Conventions</h2>
    <ul>
      <li><strong>Native ETH is <code>address(0)</code></strong> wherever a quote asset is expected.</li>
      <li><strong>Amounts are raw units</strong> of the relevant token: launched tokens always have 18 decimals; quote tokens have their own (USDG/USDT0/USDC.e are 6, BTC tokens are 8).</li>
      <li><strong>Every pool</strong> is a Uniswap V4 pool with fee tier <code>0</code>, tick spacing <code>200</code>, and the chain's <code>DuckHookV4</code> as its hook.</li>
      <li><strong>Launched token addresses end in <code>8888</code></strong> -- the create call reverts with <code>VanityAddressRequired</code> otherwise. You mine the salt client-side; see <a href="#/integrate-launch">Launching tokens</a>.</li>
      <li>The examples in this guide use <a href="https://viem.sh" target="_blank" rel="noreferrer">viem</a>; any EVM library works the same way.</li>
    </ul>
    <pre><code><span class="k">import</span> { createPublicClient, createWalletClient, http, defineChain } <span class="k">from</span> <span class="s">"viem"</span>;

<span class="k">const</span> robinhood = defineChain({
  id: 4663, name: <span class="s">"Robinhood Chain"</span>,
  nativeCurrency: { name: <span class="s">"Ether"</span>, symbol: <span class="s">"ETH"</span>, decimals: 18 },
  rpcUrls: { default: { http: [<span class="s">"https://rpc.mainnet.chain.robinhood.com"</span>] } },
});
<span class="k">const</span> publicClient = createPublicClient({ chain: robinhood, transport: http() });

<span class="k">const</span> CURVE = <span class="s">"0xcE71ce995C2A3657aF9bEC45bA1Ee2E8fA2ef5eF"</span>;
<span class="k">const</span> LAUNCHER = <span class="s">"0x5F37c68f9937A0524Cc441b4E1080Ca4F089693B"</span>;
<span class="k">const</span> CROWDFUND = <span class="s">"0xdA868A545aB058D14a70C46CA7760226e7Dcf7b9"</span>;
<span class="k">const</span> TOKEN_IMPL = <span class="s">"0x83A491C728b0485A887fE9D7360C4Ae7eF8B1461"</span>;</code></pre>
  `,
},

"integrate-launch": {
  lede: "Creating a token from your own code: mine the vanity salt, pick the fee settings, and call the family contract.",
  body: `
    <h2 id="vanity-salt">1. Mine the vanity salt</h2>
    <p>Every family clones <code>DuckToken</code> with CREATE2 and requires the token address to end in <code>0x8888</code>. The clone salt is <code>keccak256(abi.encode(msg.sender, userSalt))</code> and the deployer is the family contract, so the salt is specific to the wallet that will send the transaction and to the family you call.</p>
    <pre><code><span class="k">import</span> { keccak256, encodeAbiParameters, concat, getAddress, pad, toHex } <span class="k">from</span> <span class="s">"viem"</span>;

<span class="m">// deployer: CURVE, LAUNCHER or CROWDFUND. caller: the wallet that will send the create transaction.</span>
<span class="k">function</span> mineVanitySalt(deployer, impl, caller) {
  <span class="k">const</span> initCodeHash = keccak256(concat([
    <span class="s">"0x3d602d80600a3d3981f3363d3d373d3d3d363d73"</span>, impl, <span class="s">"0x5af43d82803e903d91602b57fd5bf3"</span>,
  ]));
  <span class="k">for</span> (<span class="k">let</span> i = 0; i &lt; 3_000_000; i++) {
    <span class="k">const</span> userSalt = pad(toHex(i), { size: 32 });
    <span class="k">const</span> salt = keccak256(encodeAbiParameters([{ type: <span class="s">"address"</span> }, { type: <span class="s">"bytes32"</span> }], [caller, userSalt]));
    <span class="k">const</span> hash = keccak256(concat([<span class="s">"0xff"</span>, deployer, salt, initCodeHash]));
    <span class="k">const</span> token = getAddress(<span class="s">"0x"</span> + hash.slice(-40));
    <span class="k">if</span> ((BigInt(token) &amp; 0xffffn) === 0x8888n) <span class="k">return</span> { userSalt, token };
  }
  <span class="k">throw new</span> Error(<span class="s">"no salt found"</span>);
}</code></pre>
    <p>It takes about 65,000 hashes on average, typically well under a second.</p>

    <h2 id="fee-settings">2. Choose fee settings</h2>
    <p>All three create calls take the same fee fields, and they're fixed once the pool registers:</p>
    <table class="data">
      <tr><th>Field</th><th>Rule</th></tr>
      <tr><td><code>hookFeeBps</code></td><td>One of <code>0</code> (= 200), <code>200</code>, <code>400</code>, <code>600</code>, <code>800</code>, <code>1000</code> -- else <code>InvalidHookFeeBps</code></td></tr>
      <tr><td><code>creatorBps + vaultBps + burnBps</code></td><td>Must equal <code>10000</code> -- else <code>InvalidVaultBps</code>. Divides the 70% of each claimed fee left after the platform and holder shares.</td></tr>
      <tr><td><code>supplyTier</code></td><td><code>0</code>-<code>6</code> = 1B … 1Q -- see <a href="#/supply">Token supply</a></td></tr>
      <tr><td><code>metaURI</code></td><td>URI of a JSON document: <code>{ name, symbol, description, image, socials: { website, twitter, telegram } }</code>. Permanent.</td></tr>
    </table>
    <p>Each family charges a flat native creation fee: read <code>creationFee()</code>, <code>launchFee()</code> or <code>campaignFee()</code> right before sending.</p>

    <h2 id="curve">3a. Bonding curve: <code>createToken</code></h2>
    <pre><code><span class="k">const</span> { userSalt } = mineVanitySalt(CURVE, TOKEN_IMPL, account);
<span class="k">const</span> fee = <span class="k">await</span> publicClient.readContract({ address: CURVE, abi: curveAbi, functionName: <span class="s">"creationFee"</span> });

<span class="k">const</span> { request, result: token } = <span class="k">await</span> publicClient.simulateContract({
  account, address: CURVE, abi: curveAbi, functionName: <span class="s">"createToken"</span>,
  args: [{
    name: <span class="s">"Quack Capital"</span>, symbol: <span class="s">"QUACK"</span>, supplyTier: 0,
    curveBps: 8000n, liquidityBps: 2000n,          <span class="m">// sum 10000; curve ≥ 3000, liquidity ≥ 1000</span>
    quoteToken: <span class="s">"0x0000000000000000000000000000000000000000"</span>, <span class="m">// native ETH</span>
    startVirtualQuote: parseEther(<span class="s">"2"</span>),           <span class="m">// virtual quote reserve the curve opens at</span>
    migrationTargetQuote: parseEther(<span class="s">"20"</span>),       <span class="m">// must be greater than startVirtualQuote</span>
    earlyBuyAmount: 0n,                              <span class="m">// ERC-20 quote only</span>
    hookFeeBps: 200n, creatorBps: 10000, vaultBps: 0, burnBps: 0,
    metaURI: <span class="s">"ipfs://..."</span>, salt: userSalt,
  }],
  value: fee + parseEther(<span class="s">"0.1"</span>),                 <span class="m">// native quote: anything above the fee is an immediate creator buy</span>
});
<span class="k">await</span> walletClient.writeContract(request);</code></pre>
    <ul>
      <li><strong>Quote token</strong>: native ETH, or one on the curve's allow-list (<code>quoteTokenAllowed(token)</code>) -- else <code>QuoteTokenNotAllowed</code>.</li>
      <li><strong>ERC-20 quote</strong>: send exactly the creation fee as <code>value</code>; an early buy is <code>earlyBuyAmount</code>, pulled with <code>transferFrom</code>, so approve the curve first.</li>
      <li>Emits <code>TokenCreated(token, creator, quoteToken, totalSupply, virtualQuote, migrationTarget)</code>.</li>
    </ul>

    <h2 id="launcher">3b. Instant: <code>launch</code></h2>
    <pre><code><span class="k">const</span> { userSalt } = mineVanitySalt(LAUNCHER, TOKEN_IMPL, account);
<span class="k">const</span> fee = <span class="k">await</span> publicClient.readContract({ address: LAUNCHER, abi: launcherAbi, functionName: <span class="s">"launchFee"</span> });

<span class="k">const</span> { request, result: [token, poolId] } = <span class="k">await</span> publicClient.simulateContract({
  account, address: LAUNCHER, abi: launcherAbi, functionName: <span class="s">"launch"</span>,
  args: [{
    name: <span class="s">"Quack Capital"</span>, symbol: <span class="s">"QUACK"</span>, metaURI: <span class="s">"ipfs://..."</span>,
    feeWallet: account,                              <span class="m">// becomes the pool's creator (address(0) = msg.sender)</span>
    positionManager: V4_POSITION_MANAGER,            <span class="m">// the chain's Uniswap V4 PositionManager</span>
    quoteToken: USDG, vanitySalt: userSalt, supplyTier: 0,
    launchMarketCap: 25_000n * 10n ** 6n,            <span class="m">// opening FDV in quote units (USDG has 6 decimals)</span>
    minQuoteOut: 0n, minTokensOut: 0n,               <span class="m">// slippage for the optional instant buy</span>
    hookFeeBps: 200n, creatorBps: 5000, vaultBps: 2500, burnBps: 2500,
    revertOnInstantBuyFailure: <span class="k">false</span>,
  }],
  value: fee + parseEther(<span class="s">"0.05"</span>),                <span class="m">// anything above the fee = instant buy, routed ETH -> quote -> token</span>
});</code></pre>
    <ul>
      <li><strong>Any quote token</strong> works, including native ETH. The instant buy only works when native ETH can reach the quote asset: native itself, or a curated token with configured routes. Otherwise it's skipped (<code>InstantBuySkipped</code>, ETH refunded) unless <code>revertOnInstantBuyFailure</code> is true.</li>
      <li>The pool exists when the transaction returns. Emits <code>TokenLaunched(token, creator, positionManager, quoteToken, hook, poolId)</code>.</li>
    </ul>

    <h2 id="crowdfund">3c. Crowdfund: <code>launch</code></h2>
    <pre><code><span class="k">const</span> { userSalt } = mineVanitySalt(CROWDFUND, TOKEN_IMPL, account);
<span class="k">const</span> fee = <span class="k">await</span> publicClient.readContract({ address: CROWDFUND, abi: crowdfundAbi, functionName: <span class="s">"campaignFee"</span> });

<span class="k">const</span> { request, result: [campaignId, token] } = <span class="k">await</span> publicClient.simulateContract({
  account, address: CROWDFUND, abi: crowdfundAbi, functionName: <span class="s">"launch"</span>,
  args: [
    <span class="s">"Quack Capital"</span>, <span class="s">"QUACK"</span>, <span class="s">"ipfs://..."</span>,
    <span class="s">"0x0000000000000000000000000000000000000000"</span>,   <span class="m">// dexQuoteAsset: native or an allowed quote asset</span>
    parseEther(<span class="s">"10"</span>),                                <span class="m">// goal, in dexQuoteAsset units</span>
    BigInt(Math.floor(Date.now() / 1000)),            <span class="m">// startTime</span>
    userSalt, 200n,                                    <span class="m">// vanitySalt, hookFeeBps</span>
    10000, 0, 0,                                       <span class="m">// creatorBps, vaultBps, burnBps</span>
    0,                                                 <span class="m">// supplyTier</span>
  ],
  value: fee,                                          <span class="m">// exactly the fee, else WrongFee</span>
});</code></pre>
    <ul>
      <li>The deadline is <code>startTime + campaignDuration()</code> (a platform setting). Contributors get <code>contributorBps</code> of supply pro-rata; <code>lpBps</code> seeds the pool.</li>
      <li>Contribute with <code>contribute(campaignId, amount)</code>: native campaigns send <code>value</code> and <code>amount = 0</code>; ERC-20 campaigns approve and pass <code>amount</code> with no value.</li>
      <li>After the deadline anyone calls <code>finalize(campaignId)</code>; then contributors call <code>claim(campaignId)</code> (success) or <code>claimRefund(campaignId)</code> (goal missed).</li>
    </ul>
  `,
},

"integrate-trade": {
  lede: "A token trades against the bonding curve until it migrates, and through its Uniswap V4 pool afterwards. Instant tokens and successful crowdfunds always use the pool.",
  body: `
    <h2 id="which-venue">1. Pick the venue</h2>
    <table class="data">
      <tr><th>Token</th><th>Venue</th><th>How to tell</th></tr>
      <tr><td>Curve token, not migrated</td><td><code>DuckBondingCurve</code></td><td><code>getTokenConfig(token).migrated == false</code>, or API <code>hasPool: false</code></td></tr>
      <tr><td>Migrated curve token, Instant token, successful crowdfund</td><td>Uniswap V4 pool</td><td>API <code>hasPool: true</code> with <code>poolId</code> and <code>hook</code></td></tr>
      <tr><td>Crowdfund still raising</td><td>Not tradeable</td><td>Use <code>contribute</code></td></tr>
    </table>

    <h2 id="curve-trades">2. Curve trades</h2>
    <pre><code><span class="m">// Quote first -- exact, same math the trade uses. Returns [tokensOut, feeQuote].</span>
<span class="k">const</span> [tokensOut] = <span class="k">await</span> publicClient.readContract({
  address: CURVE_VIEWS, abi: viewsAbi, functionName: <span class="s">"getAmountOut"</span>, args: [token, quoteIn],
});
<span class="k">const</span> deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
<span class="k">const</span> minOut = (tokensOut * 99n) / 100n;               <span class="m">// 1% slippage</span>

<span class="m">// Native-quoted: send value, amountIn = 0. ERC-20-quoted: approve CURVE, pass amountIn, no value.</span>
<span class="k">await</span> walletClient.writeContract({
  address: CURVE, abi: curveAbi, functionName: <span class="s">"buy"</span>, args: [token, 0n, minOut, deadline], value: quoteIn,
});

<span class="m">// Sell: approve CURVE for the tokens, then</span>
<span class="k">await</span> walletClient.writeContract({
  address: CURVE, abi: curveAbi, functionName: <span class="s">"sell"</span>, args: [token, tokensIn, minQuoteOut, deadline],
});</code></pre>
    <ul>
      <li><code>getAmountOutSell(token, tokensIn)</code> previews a sell.</li>
      <li><code>buyWithNative(token, minQuoteOut, minOut, deadline)</code> buys an ERC-20-quoted curve token with ETH, routed into the quote asset first (curated quote tokens only).</li>
      <li>Curve tokens can't be transferred wallet-to-wallet before migration -- only to and from the curve.</li>
      <li>The buy that reaches the migration target attempts migration automatically; if that fails (<code>MigrationFailed</code>), anyone can call <code>migrate(token)</code>.</li>
    </ul>

    <h2 id="pool-key">3. Pool trades: the PoolKey</h2>
    <pre><code><span class="m">// currency0 &lt; currency1 by address; native ETH is address(0), so it's always currency0.</span>
<span class="k">const</span> [currency0, currency1] = BigInt(token) &lt; BigInt(quote) ? [token, quote] : [quote, token];
<span class="k">const</span> poolKey = { currency0, currency1, fee: 0, tickSpacing: 200, hooks: hook }; <span class="m">// hook = the token's hook</span></code></pre>

    <h2 id="quote">4. Quote with the V4 Quoter</h2>
    <pre><code><span class="k">const</span> zeroForOne = BigInt(tokenIn) &lt; BigInt(tokenOut);
<span class="k">const</span> [amountOut] = <span class="k">await</span> publicClient.readContract({
  address: V4_QUOTER, abi: quoterAbi, functionName: <span class="s">"quoteExactInputSingle"</span>,
  args: [{ poolKey, zeroForOne, exactAmount: amountIn, hookData: <span class="s">"0x"</span> }],
});</code></pre>
    <p>The quote already includes the hook's trading fee.</p>

    <h2 id="swap">5. Swap through the Universal Router</h2>
    <p>One <code>V4_SWAP</code> command (<code>0x10</code>) with three actions: <code>SWAP_EXACT_IN_SINGLE</code> (<code>0x06</code>), <code>SETTLE_ALL</code> (<code>0x0c</code>), <code>TAKE_ALL</code> (<code>0x0f</code>).</p>
    <div class="callout warn">
      <div class="callout-title">Robinhood Chain's router takes one extra field</div>
      <p>Robinhood Chain's Universal Router is a fork whose <code>ExactInputSingleParams</code> has a 6th field, <code>uint256 minHopPriceX36</code>, before <code>hookData</code>. Ink's router uses the standard 5 fields. Encoding the wrong shape produces a garbage swap, so branch on the chain. Pass <code>0</code> for no per-hop floor.</p>
    </div>
    <pre><code><span class="k">const</span> poolKeyType = { type: <span class="s">"tuple"</span>, name: <span class="s">"poolKey"</span>, components: [
  { type: <span class="s">"address"</span>, name: <span class="s">"currency0"</span> }, { type: <span class="s">"address"</span>, name: <span class="s">"currency1"</span> },
  { type: <span class="s">"uint24"</span>, name: <span class="s">"fee"</span> }, { type: <span class="s">"int24"</span>, name: <span class="s">"tickSpacing"</span> }, { type: <span class="s">"address"</span>, name: <span class="s">"hooks"</span> },
]};
<span class="k">const</span> isRobinhood = chainId === 4663;
<span class="k">const</span> paramsType = [{ type: <span class="s">"tuple"</span>, components: [
  poolKeyType,
  { type: <span class="s">"bool"</span>, name: <span class="s">"zeroForOne"</span> },
  { type: <span class="s">"uint128"</span>, name: <span class="s">"amountIn"</span> },
  { type: <span class="s">"uint128"</span>, name: <span class="s">"amountOutMinimum"</span> },
  ...(isRobinhood ? [{ type: <span class="s">"uint256"</span>, name: <span class="s">"minHopPriceX36"</span> }] : []),
  { type: <span class="s">"bytes"</span>, name: <span class="s">"hookData"</span> },
]}];
<span class="k">const</span> params = { poolKey, zeroForOne, amountIn, amountOutMinimum: minOut, hookData: <span class="s">"0x"</span> };
<span class="k">if</span> (isRobinhood) params.minHopPriceX36 = 0n;

<span class="k">const</span> actions = encodePacked([<span class="s">"uint8"</span>, <span class="s">"uint8"</span>, <span class="s">"uint8"</span>], [0x06, 0x0c, 0x0f]);
<span class="k">const</span> input = encodeAbiParameters([{ type: <span class="s">"bytes"</span> }, { type: <span class="s">"bytes[]"</span> }], [actions, [
  encodeAbiParameters(paramsType, [params]),
  encodeAbiParameters([{ type: <span class="s">"address"</span> }, { type: <span class="s">"uint256"</span> }], [tokenIn, amountIn]),  <span class="m">// SETTLE_ALL</span>
  encodeAbiParameters([{ type: <span class="s">"address"</span> }, { type: <span class="s">"uint256"</span> }], [tokenOut, minOut]),  <span class="m">// TAKE_ALL</span>
]]);

<span class="k">await</span> walletClient.writeContract({
  address: UNIVERSAL_ROUTER, abi: routerAbi, functionName: <span class="s">"execute"</span>,
  args: [<span class="s">"0x10"</span>, [input], deadline],
  value: tokenIn === <span class="s">"0x0000000000000000000000000000000000000000"</span> ? amountIn : 0n,
});</code></pre>
    <ul>
      <li><strong>ERC-20 input</strong> goes through Permit2: approve Permit2 on the token, then <code>Permit2.approve(token, UNIVERSAL_ROUTER, amount, expiration)</code>.</li>
      <li><strong>Exact-output swaps are not supported</strong> by the hook (<code>ExactOutputNotSupported</code>).</li>
      <li><strong>One swap per pool per block per origin</strong>: a second one reverts with <code>SameBlockSwap</code>, so don't bundle two swaps on the same pool in one block from the same EOA.</li>
    </ul>
  `,
},

"integrate-data": {
  lede: "Use the REST API for indexed data and USD values, contract reads for live state, and events if you run your own indexer.",
  body: `
    <h2 id="api">REST API</h2>
    <p>Base URL <code>https://api.duckfun.family</code>. Every data route is prefixed with the chain: <code>/robinhood</code> or <code>/ink</code>. Responses are JSON; errors are <code>{ "error": "..." }</code> with a 4xx/5xx status. Rate limit: 120 requests per minute per IP. Full list: <a href="#/api">API Reference</a>.</p>
    <pre><code>GET https://api.duckfun.family/ink/tokens?family=INSTANT&amp;limit=20
GET https://api.duckfun.family/robinhood/tokens/0x…8888
GET https://api.duckfun.family/robinhood/tokens/0x…8888/trades?limit=50&amp;offset=0
GET https://api.duckfun.family/ink/price?tokens=0x0000000000000000000000000000000000000000</code></pre>
    <h3 id="token-fields">Token fields</h3>
    <table class="data">
      <tr><th>Field</th><th>Meaning</th></tr>
      <tr><td><code>id</code></td><td>Token address (lowercase)</td></tr>
      <tr><td><code>family</code></td><td><code>CURVE</code>, <code>INSTANT</code> or <code>CAMPAIGN</code> (also the <code>family</code> filter)</td></tr>
      <tr><td><code>quoteToken</code>, <code>quoteDecimals</code></td><td>Quote asset (<code>0x0…0</code> = ETH) and its decimals</td></tr>
      <tr><td><code>hasPool</code>, <code>poolId</code>, <code>hook</code></td><td>Pool state -- everything needed to build a PoolKey</td></tr>
      <tr><td><code>migrated</code>, <code>raisedQuote</code>, <code>migrationTarget</code></td><td>Curve progress (raw quote units)</td></tr>
      <tr><td><code>lastPrice</code> / <code>lastPriceUsd</code></td><td>Latest trade price per token, in quote units / USD</td></tr>
      <tr><td><code>marketCapUSD</code>, <code>volume24hUsd</code>, <code>volumeAllTimeUsd</code></td><td>USD values, <code>null</code> when the quote asset has no reference price</td></tr>
      <tr><td><code>priceChange24h</code>, <code>priceChange24hUsd</code></td><td>Percent change over ~24h, <code>null</code> without history</td></tr>
      <tr><td><code>totalSupply</code>, <code>burnedSupply</code>, <code>holderCount</code></td><td>Supply (18 decimals) and holders</td></tr>
      <tr><td><code>name</code>, <code>symbol</code>, <code>metaUri</code>, <code>imageUrl</code>, <code>socials</code></td><td>Metadata, with image and socials resolved from <code>metaUri</code></td></tr>
      <tr><td><code>campaign</code></td><td>For crowdfund tokens: <code>campaignId</code>, <code>goal</code>, <code>totalRaised</code>, <code>deadline</code>, <code>succeeded</code>, <code>finalized</code></td></tr>
    </table>
    <p>Trades from <code>/tokens/:address/trades</code> carry <code>side</code> (<code>BUY</code>/<code>SELL</code>), raw <code>quoteAmount</code> and <code>tokenAmount</code>, <code>priceUSD</code>, <code>volumeUSD</code>, <code>trader</code>, <code>timestamp</code> and <code>txHash</code>, with a <code>total</code> for pagination.</p>

    <h2 id="live-reads">Live contract reads</h2>
    <table class="data">
      <tr><th>Question</th><th>Call</th></tr>
      <tr><td>Curve state</td><td><code>DuckBondingCurve.getTokenConfig(token)</code> -- <code>raisedQuote</code>, <code>migrationTarget</code>, <code>migrated</code>, <code>poolId</code>, fee settings</td></tr>
      <tr><td>Pool fee settings and creator</td><td><code>DuckHookV4.pools(poolId)</code> -- <code>creator</code>, <code>hookFeeBps</code>, <code>creatorBps</code>, <code>vaultBps</code>, <code>burnBps</code></td></tr>
      <tr><td>Unclaimed fees</td><td><code>DuckHookV4.accruedFees(poolId)</code> (quote units)</td></tr>
      <tr><td>Campaign</td><td><code>DuckCrowdfund.getCampaignCore(id)</code> / <code>getCampaignMeta(id)</code>, <code>previewClaimable(id, account)</code></td></tr>
      <tr><td>Token's vault</td><td><code>DuckToken.vault()</code></td></tr>
      <tr><td>Holder rewards</td><td><code>DuckToken.roundStart()</code>, <code>roundPool()</code>, <code>distributing()</code></td></tr>
    </table>

    <h2 id="events">Events</h2>
    <table class="data">
      <tr><th>Contract</th><th>Event</th></tr>
      <tr><td>DuckBondingCurve</td><td><code>TokenCreated(address indexed token, address indexed creator, address quoteToken, uint256 totalSupply, uint256 virtualQuote, uint256 migrationTarget)</code></td></tr>
      <tr><td>DuckBondingCurve</td><td><code>TokenBought(address indexed token, address indexed buyer, uint256 quoteIn, uint256 tokensOut, uint256 raisedQuote)</code></td></tr>
      <tr><td>DuckBondingCurve</td><td><code>TokenSold(address indexed token, address indexed seller, uint256 tokensIn, uint256 quoteOut, uint256 raisedQuote)</code></td></tr>
      <tr><td>DuckBondingCurve</td><td><code>TokenMigrated(address indexed token, bytes32 poolId, uint256 liquidityQuote, uint256 liquidityTokens)</code></td></tr>
      <tr><td>DuckLauncher</td><td><code>TokenLaunched(address indexed token, address indexed creator, address indexed positionManager, address quoteToken, address hook, bytes32 poolId)</code></td></tr>
      <tr><td>DuckCrowdfund</td><td><code>CampaignCreated(uint256 indexed campaignId, address indexed creator, address indexed token, string name, string symbol, address dexQuoteAsset, uint256 goal, uint256 startTime, uint256 deadline)</code></td></tr>
      <tr><td>DuckCrowdfund</td><td><code>Contributed</code>, <code>CampaignSucceeded</code>, <code>CampaignFailed</code>, <code>Claimed</code>, <code>Refunded</code></td></tr>
      <tr><td>DuckHookV4</td><td><code>PoolRegistered(bytes32 indexed poolId, address indexed token, address indexed creator, uint256 hookFeeBps)</code></td></tr>
      <tr><td>DuckHookV4</td><td><code>FeesClaimed(bytes32 indexed poolId, uint256 amount)</code>, <code>BuybackBurned</code>, <code>CTOApplied</code>, <code>CTOApproved</code></td></tr>
      <tr><td>DuckToken</td><td><code>Transfer</code>, <code>HolderRewardDeposited</code>, <code>DistributionRoundClosed</code>, <code>HolderRewardPaid</code></td></tr>
    </table>
    <p>Pool swaps are the Uniswap V4 PoolManager's <code>Swap</code> event, filtered to pool ids from <code>PoolRegistered</code>.</p>
  `,
},

"integrate-fees": {
  lede: "Claiming fees, triggering holder payouts and buybacks -- all permissionless -- plus the errors you're most likely to hit.",
  body: `
    <h2 id="claim-fees">Claim trading fees</h2>
    <pre><code><span class="k">const</span> accrued = <span class="k">await</span> publicClient.readContract({ address: hook, abi: hookAbi, functionName: <span class="s">"accruedFees"</span>, args: [poolId] });
<span class="k">if</span> (accrued &gt; 0n) {
  <span class="k">await</span> walletClient.writeContract({ address: hook, abi: hookAbi, functionName: <span class="s">"claimFees"</span>, args: [poolId] });
}</code></pre>
    <p>Anyone can call it. If you're not the pool's creator you receive <strong>1% of the claimed amount</strong> in the quote currency, out of the platform's 25% -- enough to run a claim bot profitably on active pools.</p>
    <h2 id="process-batch">Pay out holder rewards</h2>
    <pre><code><span class="k">const</span> [distributing, roundStart, interval] = <span class="k">await</span> Promise.all([
  publicClient.readContract({ address: token, abi: tokenAbi, functionName: <span class="s">"distributing"</span> }),
  publicClient.readContract({ address: token, abi: tokenAbi, functionName: <span class="s">"roundStart"</span> }),
  publicClient.readContract({ address: token, abi: tokenAbi, functionName: <span class="s">"DISTRIBUTION_INTERVAL"</span> }),
]);
<span class="k">if</span> (distributing || BigInt(Math.floor(Date.now() / 1000)) &gt;= roundStart + interval) {
  <span class="k">await</span> walletClient.writeContract({ address: token, abi: tokenAbi, functionName: <span class="s">"processBatch"</span> });
}</code></pre>
    <p>Each call pays up to 500 holders and resumes where the last one stopped.</p>
    <h2 id="buyback">Trigger vault buybacks</h2>
    <p>If <code>DuckVault.pendingBuyback()</code> is above zero, <code>triggerBuyback()</code> swaps it for the token and burns it.</p>
    <h2 id="fee-splits">Route the creator's share</h2>
    <p>A pool's creator can split their own share across up to 5 wallets with <code>DuckHookV4.setFeeSplits(poolId, [{ wallet, bps }])</code> (bps sum to 10000; an empty array pays the creator directly). The vault and burn shares are fixed.</p>
    <h2 id="errors">Common errors</h2>
    <table class="data">
      <tr><th>Error</th><th>Meaning</th></tr>
      <tr><td><code>VanityAddressRequired</code></td><td>The salt doesn't produce an address ending in 8888 for this sender and family -- re-mine with the sending wallet</td></tr>
      <tr><td><code>InvalidHookFeeBps</code></td><td>Fee isn't 0/200/400/600/800/1000</td></tr>
      <tr><td><code>InvalidVaultBps</code></td><td>creatorBps + vaultBps + burnBps ≠ 10000</td></tr>
      <tr><td><code>InvalidAllocation</code></td><td>curveBps + liquidityBps ≠ 10000, or below the minimums (3000 / 1000)</td></tr>
      <tr><td><code>InvalidMarketCaps</code></td><td>startVirtualQuote is 0, or migrationTargetQuote isn't above it</td></tr>
      <tr><td><code>QuoteTokenNotAllowed</code> / <code>QuoteAssetNotAllowed</code></td><td>Quote asset not on the curve / crowdfund allow-list</td></tr>
      <tr><td><code>InsufficientCreationFee</code> / <code>WrongFee</code></td><td>Wrong <code>value</code> for the creation fee</td></tr>
      <tr><td><code>SlippageTooFewTokens</code> / <code>SlippageTooLittleQuote</code></td><td>Curve trade below your minimum</td></tr>
      <tr><td><code>DeadlineExpired</code></td><td>Curve trade deadline passed</td></tr>
      <tr><td><code>SameBlockSwap</code></td><td>Second swap on the same pool from the same origin in one block</td></tr>
      <tr><td><code>ExactOutputNotSupported</code></td><td>Pool swaps must be exact-input</td></tr>
      <tr><td><code>LaunchPhaseTransferRestricted</code></td><td>Wallet-to-wallet transfer of a curve token before migration</td></tr>
      <tr><td><code>NotLiveYet</code> / <code>DeadlinePassed</code> / <code>DeadlineNotPassed</code></td><td>Crowdfund contribute/finalize outside its window</td></tr>
    </table>
  `,
},

addresses: {
  lede: "Deployed contract addresses on Robinhood Chain (4663) and Ink (57073). Fee parameters are owner-tunable and better read live from the API.",
  body: `
    <h2 id="chains">Chains</h2>
    <table class="data">
      <tr><th></th><th>Robinhood Chain</th><th>Ink</th></tr>
      <tr><td>Chain ID</td><td class="mono">4663</td><td class="mono">57073</td></tr>
      <tr><td>RPC</td><td class="mono">https://rpc.mainnet.chain.robinhood.com</td><td class="mono">https://rpc-gel.inkonchain.com</td></tr>
      <tr><td>Explorer</td><td class="mono"><a href="https://robinhoodchain.blockscout.com" target="_blank" rel="noreferrer">robinhoodchain.blockscout.com ↗</a></td><td class="mono"><a href="https://explorer.inkonchain.com" target="_blank" rel="noreferrer">explorer.inkonchain.com ↗</a></td></tr>
    </table>
    <h2 id="core">Protocol contracts (same address on both chains)</h2>
    <table class="data">
      ${addrRow("DuckBondingCurve", "Bonding-curve family", "0xcE71ce995C2A3657aF9bEC45bA1Ee2E8fA2ef5eF")}
      ${addrRow("DuckBondingCurveViews", "Read-only curve pricing helper", "0x6cd84c6e3da0295b4a2787f1794a908a26fe8ba1")}
      ${addrRow("DuckLauncher", "Instant-launch family", "0x5F37c68f9937A0524Cc441b4E1080Ca4F089693B")}
      ${addrRow("DuckCrowdfund", "Crowdfund-raise family", "0xdA868A545aB058D14a70C46CA7760226e7Dcf7b9")}
      ${addrRow("DuckVaultFactory", "Per-token vault deployment + implementation registry", "0x006e53d079BB4c2010682a4896D1950965faD5A5")}
      ${addrRow("DuckVaultConfig", "Shared, owner-tunable risk parameters", "0x2526d694F9b6cCefE46871D1b40aeEc1313eabfB")}
      ${addrRow("DuckTokenGovernorFactory", "Per-token governor + timelock deployment", "0x29e600073c29b4f646C54c78AeE97aE8AE888999")}
      ${addrRow("DuckToken impl.", "EIP-1167 clone template, shared by all three families", "0x83A491C728b0485A887fE9D7360C4Ae7eF8B1461")}
    </table>
    <h2 id="robinhood">Robinhood Chain</h2>
    <table class="data">
      ${addrRow("DuckHookV4", "Trading fee, fee claims, CTO", "0x483b529fa121c5402778a511A98fB326940042CC")}
      ${addrRow("WETH", "Wrapped native ETH", "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73")}
      ${addrRow("Uniswap V4 PoolManager", "V4 singleton", "0x8366a39CC670B4001A1121B8F6A443A643e40951")}
      ${addrRow("Uniswap V4 PositionManager", "V4 periphery", "0x58daec3116aae6D93017bAAea7749052E8a04fA7")}
      ${addrRow("Uniswap Universal Router", "Swap routing", "0x8876789976dEcBfCbBbe364623C63652db8C0904")}
      ${addrRow("Uniswap V4 Quoter", "Swap previews", "0x8dc178EFb8111bB0973dd9d722ebeFF267c98f94")}
      ${addrRow("Uniswap V4 StateView", "Pool state reads", "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b")}
      ${addrRow("Permit2", "Canonical Permit2", "0x000000000022D473030F116dDEE9F6B43aC78BA3")}
    </table>
    <h2 id="ink">Ink</h2>
    <table class="data">
      ${addrRow("DuckHookV4", "Trading fee, fee claims, CTO", "0x5a05a1f0A101237D8c350EFfA54f4b3c9bc142cc")}
      ${addrRow("WETH", "Wrapped native ETH", "0x4200000000000000000000000000000000000006")}
      ${addrRow("Uniswap V4 PoolManager", "V4 singleton", "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32")}
      ${addrRow("Uniswap V4 PositionManager", "V4 periphery", "0x1b35d13a2E2528f192637F14B05f0Dc0e7dEB566")}
      ${addrRow("Uniswap Universal Router", "Swap routing", "0x112908daC86e20e7241B0927479Ea3Bf935d1fa0")}
      ${addrRow("Uniswap V4 Quoter", "Swap previews", "0x3972C00f7ed4885e145823eb7C655375d275A1C5")}
      ${addrRow("Uniswap V4 StateView", "Pool state reads", "0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990")}
      ${addrRow("Permit2", "Canonical Permit2", "0x000000000022D473030F116dDEE9F6B43aC78BA3")}
    </table>
    <h2 id="quote-tokens">Curated quote tokens</h2>
    <p>Bonding Curve and Crowdfund accept these (plus native ETH) unless the owner changes the list on-chain; Instant accepts any token. Every token below has native-ETH swap routes configured on all three families.</p>
    <h3 id="quote-robinhood">Robinhood Chain</h3>
    <table class="data">
      ${quoteRows([
        ["USDG", 6, "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"], ["U", 18, "0xcE24439F2D9C6a2289F741120FE202248B666666"],
        ["cbBTC", 8, "0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4"], ["TAO", 18, "0xf3081494B87e8D5fb7960f066E931D1D0e6E3d67"],
        ["SPY", 18, "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C"], ["QQQ", 18, "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68"],
        ["NVDA", 18, "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC"], ["AAPL", 18, "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9"],
        ["TSLA", 18, "0x322F0929c4625eD5bAd873c95208D54E1c003b2d"], ["GOOGL", 18, "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3"],
        ["AMZN", 18, "0x12f190a9F9d7D37a250758b26824B97CE941bF54"], ["MSFT", 18, "0xe93237C50D904957Cf27E7B1133b510C669c2e74"],
        ["MSTR", 18, "0xec262a75e413fAfD0dF80480274532C79D42da09"], ["SPCX", 18, "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa"],
        ["GME", 18, "0x1b0E319c6A659F002271B69dB8A7df2F911c153E"], ["GLD", 18, "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e"],
      ])}
    </table>
    <h3 id="quote-ink">Ink</h3>
    <p>Ink's tokenized stocks trade against USDG on Uniswap v3, so their routes go ETH → USDG → stock.</p>
    <table class="data">
      ${quoteRows([
        ["USDT0", 6, "0x0200C29006150606B650577BBE7B6248F58470c1"], ["USDG", 6, "0xe343167631d89B6Ffc58B88d6b7fB0228795491D"],
        ["USDC.e", 6, "0xF1815bd50389c46847f0Bda824eC8da914045D14"], ["kBTC", 8, "0x73E0C0d45E048D25Fc26Fa3159b0aA04BfA4Db98"],
        ["wSPYx", 18, "0xE7E553Cd128F0011777323A0b44a7b96EA1CB540"], ["wNVDAx", 18, "0xa8ddb5Cd96b5222AFe198316E9A57CAA642850D5"],
        ["wAAPLx", 18, "0x943BF64D566c32A2Bcd41AC92FB63C111cC9De8f"], ["wTSLAx", 18, "0xc3FdBe3A68EE5dE461D30415a8165cf9Aefe1171"],
        ["wMSTRx", 18, "0x30987adF0B11dc698438a99BA04ec3a1AB2c7EaB"], ["wSPCXx", 18, "0x8e2eeD8b8B5E13Ea7BF38e50d7821d2C57309072"],
        ["wNFLXx", 18, "0x7d87fD6A379714194a797c0bBB8B40c30D250856"],
      ])}
    </table>
  `,
},

};

// Fold PAGES' bodies into the NAV entries so app.js has one flat lookup.
NAV.forEach((g) => g.pages.forEach((p) => Object.assign(p, PAGES[p.id])));
