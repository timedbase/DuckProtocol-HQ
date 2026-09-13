#!/usr/bin/env python3
"""Generates DuckSubgraph-RH and DuckSubgraph-Ink from one source.

Both folders get identical schema, mappings and ABIs; only the manifest's network, addresses and
start blocks (plus the package/deploy names) differ. Manifest event signatures are derived from the
compiled contract ABIs, and any ABI event without a hand-written handler gets a generated one that
records it as an AdminEvent, so every event the contracts can emit is indexed.
"""
import json, os, re, sys

LIB = '/home/mindless/Pictures/Unstable/DuckLibrary'
OUT = f'{LIB}/DuckProtocol/deploy/out'
OLD_POOLMANAGER_ABI = f'{LIB}/DuckProtocol-RH/abis/PoolManager.json'   # read only
DEST = f'{LIB}/DuckProtocol-HQ/subgraph'

COMMON = {
    'DuckBondingCurve':         '0xcE71ce995C2A3657aF9bEC45bA1Ee2E8fA2ef5eF',
    'DuckLauncher':             '0x5F37c68f9937A0524Cc441b4E1080Ca4F089693B',
    'DuckCrowdfund':            '0xdA868A545aB058D14a70C46CA7760226e7Dcf7b9',
    'DuckVaultFactory':         '0x006e53d079BB4c2010682a4896D1950965faD5A5',
    'DuckVaultConfig':          '0x2526d694F9b6cCefE46871D1b40aeEc1313eabfB',
    'DuckTokenGovernorFactory': '0x29e600073c29b4f646C54c78AeE97aE8AE888999',
}
CHAINS = {
    'DuckSubgraph-RH': dict(network='robinhood-mainnet', chainName='Robinhood Chain (4663)', slug='duck-subgraph-rh',
                            startBlock=61219630, hook='0x483b529fa121c5402778a511A98fB326940042CC',
                            poolManager='0x8366a39CC670B4001A1121B8F6A443A643e40951'),
    'DuckSubgraph-Ink': dict(network='ink', chainName='Ink (57073)', slug='duck-subgraph-ink',
                             startBlock=55728270, hook='0x5a05a1f0A101237D8c350EFfA54f4b3c9bc142cc',
                             poolManager='0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32'),
}

CONTRACT_ABIS = ['DuckBondingCurve', 'DuckLauncher', 'DuckCrowdfund', 'DuckHookV4', 'DuckVault', 'DuckVaultFactory',
                 'DuckVaultConfig', 'DuckToken', 'DuckTokenGovernor', 'DuckTokenGovernorFactory',
                 'TimelockControllerUpgradeable']

ERC20_ABI = [
    {"type": "function", "name": "balanceOf", "stateMutability": "view", "inputs": [{"name": "account", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}]},
    {"type": "function", "name": "decimals", "stateMutability": "view", "inputs": [], "outputs": [{"name": "", "type": "uint8"}]},
    {"type": "function", "name": "symbol", "stateMutability": "view", "inputs": [], "outputs": [{"name": "", "type": "string"}]},
]

# (manifest name, abi, source file, is_template, extra abis, entities)
SOURCES = [
    ('DuckBondingCurve', 'DuckBondingCurve', 'duck-bonding-curve', False, ['DuckToken', 'ERC20', 'UniswapV3Factory', 'UniswapV3Pool', 'V4StateReader'],
     ['Token', 'Trade', 'Migration', 'EmergencyMigration', 'MigrationFailure', 'CurveFeeClaim', 'TokenHourData', 'QuoteToken', 'QuotePrice', 'DiscoveredReferencePool', 'QuoteDiscovery', 'AdminEvent']),
    ('DuckLauncher', 'DuckLauncher', 'duck-launcher', False, ['DuckToken', 'ERC20', 'UniswapV3Factory', 'UniswapV3Pool', 'V4StateReader'],
     ['Token', 'Launch', 'QuoteToken', 'QuotePrice', 'DiscoveredReferencePool', 'QuoteDiscovery', 'AdminEvent']),
    ('DuckCrowdfund', 'DuckCrowdfund', 'duck-crowdfund', False, ['DuckToken', 'ERC20', 'UniswapV3Factory', 'UniswapV3Pool', 'V4StateReader'],
     ['Token', 'Campaign', 'Contribution', 'Claim', 'Refund', 'QuoteToken', 'QuotePrice', 'DiscoveredReferencePool', 'QuoteDiscovery', 'AdminEvent']),
    ('DuckHookV4', 'DuckHookV4', 'duck-hook-v4', False, [],
     ['PoolRegistration', 'HookFeeClaim', 'CTOEvent', 'HookBuybackBurn', 'Token', 'AdminEvent']),
    ('PoolManager', 'PoolManager', 'pool-manager', False, ['ERC20', 'UniswapV3Factory', 'UniswapV3Pool', 'V4StateReader'],
     ['PoolSwap', 'Token', 'TokenHourData', 'QuoteToken', 'QuotePrice', 'DiscoveredReferencePool', 'QuoteDiscovery']),
    ('DuckVaultFactory', 'DuckVaultFactory', 'duck-vault-factory', False, [],
     ['Vault', 'AdminEvent']),
    ('DuckVaultConfig', 'DuckVaultConfig', 'duck-vault-config', False, [],
     ['AdminEvent']),
    ('DuckTokenGovernorFactory', 'DuckTokenGovernorFactory', 'duck-token-governor-factory', False, [],
     ['Governor', 'Timelock', 'AdminEvent']),
    ('DuckToken', 'DuckToken', 'duck-token', True, [],
     ['Token', 'Holder', 'HolderRewardDeposit', 'HolderRewardRound', 'HolderRewardPayout', 'AdminEvent']),
    ('DuckVault', 'DuckVault', 'duck-vault', True, [],
     ['Vault', 'VaultDeposit', 'VaultBorrow', 'VaultRepayment', 'VaultCollateralChange', 'VaultLiquidation',
      'VaultBadDebt', 'VaultBuybackQueued', 'VaultBuybackExecuted', 'VaultWithdrawal', 'AdminEvent']),
    ('DuckTokenGovernor', 'DuckTokenGovernor', 'duck-token-governor', True, [],
     ['Proposal', 'Vote', 'AdminEvent']),
    ('TimelockControllerUpgradeable', 'TimelockControllerUpgradeable', 'timelock-controller', True, [],
     ['TimelockOperation', 'AdminEvent']),
]
ONLY_EVENTS = {'PoolManager': {'Swap'}}   # the singleton emits for every pool on the chain; only Swap matters

# ---- USD pricing ----
# Stablecoins valued at exactly $1, and each network's wrapped native token.
STABLES = {
    'robinhood-mainnet': ['0x5fc5360d0400a0fd4f2af552add042d716f1d168',   # USDG
                          '0xce24439f2d9c6a2289f741120fe202248b666666'],  # U
    'ink': ['0x0200c29006150606b650577bbe7b6248f58470c1',                 # USDT0
            '0xf1815bd50389c46847f0bda824eC8da914045D14'.lower(),         # USDC (bridged)
            '0xe343167631d89b6ffc58b88d6b7fb0228795491d'],                # USDG
}
WRAPPED_NATIVE = {'robinhood-mainnet': '0x0bd7d308f8e1639fab988df18a8011f41eacad73',
                  'ink': '0x4200000000000000000000000000000000000006'}
# Reference pools, from an on-chain liquidity scan. ETH_STABLE pools set ETH/USD (weighted by in-range
# liquidity when a network has several); TOKEN_ETH / TOKEN_STABLE pools price one quote token.
REF_POOLS = [
    {
        "network": "robinhood-mainnet",
        "symbol": "BTC",
        "token": "0xcec185eb182c47d1ba1efc84e6959e18cd620be4",
        "kind": "TOKEN_ETH",
        "pool": "0xd30e44aae604b42a63f6f9a8109fd0408f35b9fb",
        "pricedIsToken0": False,
        "dec0": 18,
        "dec1": 8
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "TAO",
        "token": "0xf3081494b87e8d5fb7960f066e931d1d0e6e3d67",
        "kind": "TOKEN_ETH",
        "pool": "0x572d51a3de7c220fdd19451e4e24183b9f2ecadc",
        "pricedIsToken0": False,
        "dec0": 18,
        "dec1": 18
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "SPY",
        "token": "0x117cc2133c37b721f49de2a7a74833232b3b4c0c",
        "kind": "TOKEN_ETH",
        "pool": "0xddcbba3666f578e3f09516f21ff85bfee859ab5e",
        "pricedIsToken0": False,
        "dec0": 18,
        "dec1": 18
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "NVDA",
        "token": "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec",
        "kind": "TOKEN_ETH",
        "pool": "0x62ab521f71431f78ac374cdbadc6cda3c8916b6c",
        "pricedIsToken0": False,
        "dec0": 18,
        "dec1": 18
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "SPCX",
        "token": "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea",
        "kind": "TOKEN_ETH",
        "pool": "0xc3c9f0171490ef0f4536fe493f3b0ebb5ee0cb5e",
        "pricedIsToken0": False,
        "dec0": 18,
        "dec1": 18
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "AAPL",
        "token": "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9",
        "kind": "TOKEN_ETH",
        "pool": "0x8bb3514e2204e1cdf3ac149efee7ff04d91b719f",
        "pricedIsToken0": False,
        "dec0": 18,
        "dec1": 18
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "TSLA",
        "token": "0x322f0929c4625ed5bad873c95208d54e1c003b2d",
        "kind": "TOKEN_ETH",
        "pool": "0xa953ca88ff430e9487c60ca34d757414f4efda07",
        "pricedIsToken0": False,
        "dec0": 18,
        "dec1": 18
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "GLD",
        "token": "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e",
        "kind": "TOKEN_ETH",
        "pool": "0x98996e833ea35ec17c3645ca7b6dd40d188564c4",
        "pricedIsToken0": False,
        "dec0": 18,
        "dec1": 18
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "MSTR",
        "token": "0xec262a75e413fafd0df80480274532c79d42da09",
        "kind": "TOKEN_ETH",
        "pool": "0x70504a6fafdbfb75fe971faa4dd716e79ac5624c",
        "pricedIsToken0": False,
        "dec0": 18,
        "dec1": 18
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "GME",
        "token": "0x1b0e319c6a659f002271b69db8a7df2f911c153e",
        "kind": "TOKEN_ETH",
        "pool": "0xc6bcc95043dc48c204bb2d57fb264a10efe0a607",
        "pricedIsToken0": False,
        "dec0": 18,
        "dec1": 18
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "GOOGL",
        "token": "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3",
        "kind": "TOKEN_STABLE",
        "pool": "0x34d0dc122cf9a8eb296fc5e0d3a233625d7d19b7",
        "pricedIsToken0": True,
        "dec0": 18,
        "dec1": 6
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "AMZN",
        "token": "0x12f190a9f9d7d37a250758b26824b97ce941bf54",
        "kind": "TOKEN_STABLE",
        "pool": "0x8ac92da74ab5f3b1d024dc1943ad7e15dc4179ef",
        "pricedIsToken0": True,
        "dec0": 18,
        "dec1": 6
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "MSFT",
        "token": "0xe93237c50d904957cf27e7b1133b510c669c2e74",
        "kind": "TOKEN_STABLE",
        "pool": "0xeb60bcd1d920ad6e102690ccfc6fb488899e1510",
        "pricedIsToken0": False,
        "dec0": 6,
        "dec1": 18
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "ETH",
        "token": "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
        "kind": "ETH_STABLE",
        "pool": "0x52e65b17fb6e5ba00ed806f37afcd2daa50271ca",
        "pricedIsToken0": True,
        "dec0": 18,
        "dec1": 6
    },
    {
        "network": "robinhood-mainnet",
        "symbol": "QQQ",
        "token": "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68",
        "kind": "TOKEN_ETH_V4",
        "poolId": "0x7ba2c8a5f53ee4cda9ef07effe81bb8509efafb79a26d0e33b28ada879e5bb52",
        "tokenDecimals": 18
    },
    {
        "network": "ink",
        "symbol": "ETH",
        "token": "0x4200000000000000000000000000000000000006",
        "kind": "ETH_STABLE",
        "pool": "0x356667da30c89cc36c65d394500424d5eba8731c",
        "pricedIsToken0": False,
        "dec0": 6,
        "dec1": 18
    },
    {
        "network": "ink",
        "symbol": "ETH",
        "token": "0x4200000000000000000000000000000000000006",
        "kind": "ETH_STABLE",
        "pool": "0x5a56ff4b88f0ff5b33d4b0cf541fe76daf343e46",
        "pricedIsToken0": True,
        "dec0": 18,
        "dec1": 6
    },
    {
        "network": "ink",
        "symbol": "BTC",
        "token": "0x73e0c0d45e048d25fc26fa3159b0aa04bfa4db98",
        "kind": "TOKEN_STABLE",
        "pool": "0x6ab98b2e11a3cadb7021c390b9011b6a7c03cdfe",
        "pricedIsToken0": False,
        "dec0": 6,
        "dec1": 8
    },
    {
        "network": "ink",
        "symbol": "NVDAw",
        "token": "0xa8ddb5cd96b5222afe198316e9a57caa642850d5",
        "kind": "TOKEN_STABLE",
        "pool": "0x01951ddb43a451500bfaf652d40c07309fad4727",
        "pricedIsToken0": True,
        "dec0": 18,
        "dec1": 6
    },
    {
        "network": "ink",
        "symbol": "MSTRw",
        "token": "0x30987adf0b11dc698438a99ba04ec3a1ab2c7eab",
        "kind": "TOKEN_STABLE",
        "pool": "0x169f2ab4d25aba4f9b2743658f8549641c9d069d",
        "pricedIsToken0": True,
        "dec0": 18,
        "dec1": 6
    },
    {
        "network": "ink",
        "symbol": "SPYw",
        "token": "0xe7e553cd128f0011777323a0b44a7b96ea1cb540",
        "kind": "TOKEN_STABLE",
        "pool": "0x06fb000fe9c6505eb3b2cdf52445d8c7d5690f47",
        "pricedIsToken0": False,
        "dec0": 6,
        "dec1": 18
    },
    {
        "network": "ink",
        "symbol": "SPCXw",
        "token": "0x8e2eed8b8b5e13ea7bf38e50d7821d2c57309072",
        "kind": "TOKEN_STABLE",
        "pool": "0xdf1531451f6d97f847b27fac671738d113db1406",
        "pricedIsToken0": True,
        "dec0": 18,
        "dec1": 6
    },
    {
        "network": "ink",
        "symbol": "AAPLw",
        "token": "0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f",
        "kind": "TOKEN_STABLE",
        "pool": "0x8986bb68391ad5b0afd7605e8075b273ca0189d6",
        "pricedIsToken0": True,
        "dec0": 18,
        "dec1": 6
    },
    {
        "network": "ink",
        "symbol": "NFLXw",
        "token": "0x7d87fd6a379714194a797c0bbb8b40c30d250856",
        "kind": "TOKEN_STABLE",
        "pool": "0x111d25ac72ad434d895f6f1ac8184ab5175e99ff",
        "pricedIsToken0": True,
        "dec0": 18,
        "dec1": 6
    },
    {
        "network": "ink",
        "symbol": "TSLAw",
        "token": "0xc3fdbe3a68ee5de461d30415a8165cf9aefe1171",
        "kind": "TOKEN_STABLE",
        "pool": "0x09444cbdff5cd4437150a1f26865a3ed85d8ed5e",
        "pricedIsToken0": True,
        "dec0": 18,
        "dec1": 6
    }
]
STABLE_NAMES = {'robinhood-mainnet': 'USDG and U', 'ink': 'USDT0, USDC (bridged) and USDG'}
ETH_SOURCE = {'robinhood-mainnet': 'the WETH/USDG v3 pool',
              'ink': 'the WETH/USDT0 and WETH/USDG v3 pools, weighted by their in-range liquidity'}
# Reference pools start indexing this many blocks before the deployment, so prices already exist when
# the first DuckProtocol trades arrive.
REF_START_OFFSET = 100_000
UNISWAP_V3_POOL_ABI = [{"type": "event", "name": "Swap", "anonymous": False, "inputs": [
    {"indexed": True, "name": "sender", "type": "address"}, {"indexed": True, "name": "recipient", "type": "address"},
    {"indexed": False, "name": "amount0", "type": "int256"}, {"indexed": False, "name": "amount1", "type": "int256"},
    {"indexed": False, "name": "sqrtPriceX96", "type": "uint160"}, {"indexed": False, "name": "liquidity", "type": "uint128"},
    {"indexed": False, "name": "tick", "type": "int24"}]}]
UNISWAP_V3_POOL_ABI += [
    {"type": "function", "name": "slot0", "stateMutability": "view", "inputs": [], "outputs": [
        {"name": "sqrtPriceX96", "type": "uint160"}, {"name": "tick", "type": "int24"}, {"name": "observationIndex", "type": "uint16"},
        {"name": "observationCardinality", "type": "uint16"}, {"name": "observationCardinalityNext", "type": "uint16"},
        {"name": "feeProtocol", "type": "uint8"}, {"name": "unlocked", "type": "bool"}]},
    {"type": "function", "name": "liquidity", "stateMutability": "view", "inputs": [], "outputs": [{"name": "", "type": "uint128"}]},
]
UNISWAP_V3_FACTORY_ABI = [{"type": "function", "name": "getPool", "stateMutability": "view",
    "inputs": [{"name": "tokenA", "type": "address"}, {"name": "tokenB", "type": "address"}, {"name": "fee", "type": "uint24"}],
    "outputs": [{"name": "", "type": "address"}]}]
# Raw storage reads from the v4 PoolManager (pool state is not exposed through a getter).
V4_STATE_READER_ABI = [{"type": "function", "name": "extsload", "stateMutability": "view",
    "inputs": [{"name": "slot", "type": "bytes32"}], "outputs": [{"name": "", "type": "bytes32"}]}]
# The v3 factory each chain's Universal Router is bound to, and each chain's v4 PoolManager; discovery
# looks up pools for arbitrary quote tokens through these.
V3_FACTORY = {'robinhood-mainnet': '0x1f7d7550b1b028f7571e69a784071f0205fd2efa',
              'ink': '0x640887a9ba3a9c53ed27d0f7e8246a4f933f3424'}
V4_POOL_MANAGER = {'robinhood-mainnet': '0x8366a39cc670b4001a1121b8f6a443a643e40951',
                   'ink': '0x360e68faccca8ca495c1b759fd9eee466db9fb32'}

SCHEMA = r'''enum TokenFamily {
  BondingCurve
  Launcher
  Crowdfund
}

# Decimals for an ERC20 quote token, read once from the token and cached. Native ETH (address(0))
# is never stored: it is always 18 decimals.
type QuoteToken @entity(immutable: false) {
  id: Bytes!
  decimals: Int!
  symbol: String
}

# Reference USD price of a quote token. Stablecoins are $1 and never stored. ETH is stored under both
# address(0) and the wrapped native token. Tokens priced against ETH store priceETH, and their USD value
# is priceETH x the current ETH price, so it never goes stale when only ETH moves.
enum PriceOrigin {
  CURATED # reference pool chosen from the liquidity scan
  DISCOVERED # found at runtime for a quote token with no curated reference; no minimum depth
}

type QuotePrice @entity(immutable: false) {
  id: Bytes! # token address
  priceUSD: BigDecimal
  priceETH: BigDecimal
  source: Bytes! # reference pool address, or v4 poolId
  origin: PriceOrigin!
  depthUSD: BigDecimal # DISCOVERED only: USD on the pool's ETH/stablecoin side when it was chosen
  updatedAt: BigInt!
  updatedAtBlock: BigInt!
}

# Latest price and in-range liquidity of each ETH/stablecoin reference pool; ETH/USD is their
# liquidity-weighted average.
# A reference pool found at runtime for a quote token with no curated reference (in practice an
# arbitrary token picked in the launcher).
type DiscoveredReferencePool @entity(immutable: false) {
  id: Bytes! # v3 pool address, or v4 poolId
  isV4: Boolean!
  token: Bytes!
  kind: Int! # 1 = priced against ETH, 2 = priced against a $1 stablecoin
  pricedIsToken0: Boolean!
  dec0: Int!
  dec1: Int!
  depthUSD: BigDecimal
  discoveredAt: BigInt!
  discoveredAtBlock: BigInt!
}

# Discovery attempts per quote token, so a token with no pool is retried at most every 6 hours.
type QuoteDiscovery @entity(immutable: false) {
  id: Bytes! # quote token
  found: Boolean!
  attempts: Int!
  lastAttemptAt: BigInt!
  pool: Bytes
}

type EthReferencePool @entity(immutable: false) {
  id: Bytes! # pool address
  priceUSD: BigDecimal!
  liquidity: BigInt!
  updatedAt: BigInt!
}

type Token @entity(immutable: false) {
  id: Bytes! # token address
  family: TokenFamily!
  creator: Bytes!
  name: String
  symbol: String
  decimals: Int!
  metaUri: String
  quoteToken: Bytes # address(0) = native ETH
  totalSupply: BigInt
  burnedSupply: BigInt!
  # True once the token trades in its own Uniswap v4 pool: immediately for launcher tokens, after
  # migration for bonding-curve tokens, after a successful raise for crowdfund tokens.
  hasPool: Boolean!
  # Bonding-curve tokens only: the curve completed and liquidity moved to the pool.
  migrated: Boolean!
  poolId: Bytes
  hook: Bytes
  hookFeeBps: BigInt
  positionManager: Bytes
  # Curve-phase fields (BondingCurve family only).
  virtualQuote: BigInt
  migrationTarget: BigInt
  raisedQuote: BigInt
  bcTokensSold: BigInt
  # Quote units per token, decimal-adjusted; USD conversion is left to consumers.
  lastPrice: BigDecimal
  lastTradeAt: BigInt
  volumeAllTime: BigInt! # raw quote units
  # USD values use the quote token's reference price at trade time; null while it has none.
  lastPriceUSD: BigDecimal
  marketCapUSD: BigDecimal # lastPriceUSD x (totalSupply - burnedSupply)
  volumeUSDAllTime: BigDecimal!
  holderCount: Int!
  holders: [Holder!]! @derivedFrom(field: "token")
  vault: Vault @derivedFrom(field: "token")
  campaign: Campaign @derivedFrom(field: "token")
  launch: Launch @derivedFrom(field: "token")
  # Holder rewards: config is fixed when the token's pool is created.
  rewardHook: Bytes
  rewardCurrency: Bytes
  # Round currently being paid out in batches (between DistributionRoundClosed and
  # DistributionRoundFinished); HolderRewardPaid carries no round id, so payouts attach to this.
  activeRewardRound: HolderRewardRound
  rewardRounds: [HolderRewardRound!]! @derivedFrom(field: "token")
  createdAtBlock: BigInt!
  createdAtTimestamp: BigInt!
  createdAtTx: Bytes!
}

type Holder @entity(immutable: false) {
  id: String! # token address + "-" + account address
  token: Token!
  account: Bytes!
  balance: BigInt!
  updatedAt: BigInt!
  updatedAtBlock: BigInt!
}

type TokenHourData @entity(immutable: false) {
  id: String! # token address + "-" + floor(timestamp / 3600)
  token: Token!
  hourStartUnix: BigInt!
  volumeQuote: BigInt!
  volumeUSD: BigDecimal!
  closePrice: BigDecimal # lastPrice after the hour's latest trade
  closePriceUSD: BigDecimal
}

# Bonding-curve trades (before migration).
type Trade @entity(immutable: true) {
  id: Bytes!
  token: Token!
  trader: Bytes!
  isBuy: Boolean!
  quoteAmount: BigInt!
  tokenAmount: BigInt!
  raisedQuote: BigInt
  priceUSD: BigDecimal
  volumeUSD: BigDecimal
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

# Swaps in a token's own v4 pool (after it has one).
type PoolSwap @entity(immutable: true) {
  id: Bytes!
  token: Token!
  trader: Bytes!
  isBuy: Boolean!
  quoteAmount: BigInt!
  tokenAmount: BigInt!
  priceUSD: BigDecimal
  volumeUSD: BigDecimal
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type Migration @entity(immutable: true) {
  id: Bytes!
  token: Token!
  poolId: Bytes!
  liquidityQuote: BigInt!
  liquidityTokens: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type EmergencyMigration @entity(immutable: true) {
  id: Bytes!
  token: Token!
  to: Bytes!
  quoteAmount: BigInt!
  tokenAmount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type MigrationFailure @entity(immutable: true) {
  id: Bytes!
  token: Token!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type CurveFeeClaim @entity(immutable: true) {
  id: Bytes!
  token: Token!
  creator: Bytes!
  creatorAmount: BigInt!
  platformAmount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type Launch @entity(immutable: true) {
  id: Bytes! # token address
  token: Token!
  creator: Bytes!
  positionManager: Bytes!
  quoteToken: Bytes!
  hook: Bytes!
  poolId: Bytes!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type Campaign @entity(immutable: false) {
  id: String! # crowdfund address + "-" + campaignId
  campaignId: BigInt!
  creator: Bytes!
  token: Token
  name: String!
  symbol: String!
  dexQuoteAsset: Bytes!
  goal: BigInt!
  startTime: BigInt!
  deadline: BigInt!
  totalRaised: BigInt!
  finalized: Boolean!
  succeeded: Boolean!
  # Fixed at launch and never re-emitted; read once via getCampaignMeta. Null if that call reverts.
  metaUri: String
  totalSupply: BigInt
  contributorBps: BigInt
  lpBps: BigInt
  hookFeeBps: BigInt
  vaultBps: Int
  contributions: [Contribution!]! @derivedFrom(field: "campaign")
  claims: [Claim!]! @derivedFrom(field: "campaign")
  refunds: [Refund!]! @derivedFrom(field: "campaign")
  createdAtBlock: BigInt!
  createdAtTimestamp: BigInt!
  createdAtTx: Bytes!
}

type Contribution @entity(immutable: true) {
  id: Bytes!
  campaign: Campaign!
  contributor: Bytes!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type Claim @entity(immutable: true) {
  id: Bytes!
  campaign: Campaign!
  contributor: Bytes!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type Refund @entity(immutable: true) {
  id: Bytes!
  campaign: Campaign!
  contributor: Bytes!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type PoolRegistration @entity(immutable: true) {
  id: Bytes! # poolId
  poolId: Bytes!
  token: Token!
  creator: Bytes!
  hook: Bytes!
  hookFeeBps: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type HookFeeClaim @entity(immutable: true) {
  id: Bytes!
  poolId: Bytes!
  token: Token
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

enum CTOEventType {
  Applied
  Approved
  Rejected
}

type CTOEvent @entity(immutable: true) {
  id: Bytes!
  type: CTOEventType!
  poolId: Bytes!
  token: Token
  applicant: Bytes
  newCreator: Bytes
  paid: BigInt
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type HookBuybackBurn @entity(immutable: true) {
  id: Bytes!
  poolId: Bytes!
  token: Token
  quoteSpent: BigInt!
  tokensBurned: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type HolderRewardDeposit @entity(immutable: true) {
  id: Bytes!
  token: Token!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type HolderRewardRound @entity(immutable: false) {
  id: String! # token address + "-" + roundStart
  token: Token!
  roundStart: BigInt!
  pool: BigInt!
  eligibleCount: BigInt!
  totalWeight: BigInt!
  finished: Boolean!
  totalPaid: BigInt!
  payouts: [HolderRewardPayout!]! @derivedFrom(field: "round")
  closedAtBlock: BigInt!
  closedAtTimestamp: BigInt!
  closedAtTx: Bytes!
  finishedAtBlock: BigInt
  finishedAtTimestamp: BigInt
  finishedAtTx: Bytes
}

type HolderRewardPayout @entity(immutable: true) {
  id: Bytes!
  token: Token!
  round: HolderRewardRound
  account: Bytes!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type Vault @entity(immutable: false) {
  id: Bytes! # vault address
  token: Token!
  family: Bytes!
  creator: Bytes!
  governor: Bytes
  currency: Bytes
  poolId: Bytes
  enabled: Boolean!
  createdAtBlock: BigInt!
  createdAtTimestamp: BigInt!
  createdAtTx: Bytes!
}

type VaultDeposit @entity(immutable: true) {
  id: Bytes!
  vault: Vault!
  from: Bytes!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type VaultBorrow @entity(immutable: true) {
  id: Bytes!
  vault: Vault!
  borrower: Bytes!
  amount: BigInt!
  newDebt: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type VaultRepayment @entity(immutable: true) {
  id: Bytes!
  vault: Vault!
  borrower: Bytes!
  amount: BigInt!
  remainingDebt: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type VaultCollateralChange @entity(immutable: true) {
  id: Bytes!
  vault: Vault!
  borrower: Bytes!
  isAdd: Boolean!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type VaultLiquidation @entity(immutable: true) {
  id: Bytes!
  vault: Vault!
  borrower: Bytes!
  liquidator: Bytes!
  repaid: BigInt!
  seized: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type VaultBadDebt @entity(immutable: true) {
  id: Bytes!
  vault: Vault!
  borrower: Bytes!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type VaultBuybackQueued @entity(immutable: true) {
  id: Bytes!
  vault: Vault!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type VaultBuybackExecuted @entity(immutable: true) {
  id: Bytes!
  vault: Vault!
  currencyIn: BigInt!
  tokensBurned: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type VaultWithdrawal @entity(immutable: true) {
  id: Bytes!
  vault: Vault!
  to: Bytes!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type Governor @entity(immutable: false) {
  id: Bytes! # governor address
  vault: Vault!
  creator: Bytes!
  createdAtBlock: BigInt!
  createdAtTimestamp: BigInt!
  createdAtTx: Bytes!
}

type Timelock @entity(immutable: false) {
  id: Bytes! # timelock address
  vault: Vault!
  createdAtBlock: BigInt!
  createdAtTimestamp: BigInt!
  createdAtTx: Bytes!
}

type Proposal @entity(immutable: false) {
  id: String! # governor address + "-" + proposalId
  governor: Governor!
  proposalId: BigInt!
  proposer: Bytes
  targets: [Bytes!]
  values: [BigInt!]
  signatures: [String!]
  calldatas: [Bytes!]
  voteStart: BigInt
  voteEnd: BigInt
  description: String
  etaSeconds: BigInt
  canceled: Boolean!
  queued: Boolean!
  executed: Boolean!
  createdAtBlock: BigInt!
  createdAtTimestamp: BigInt!
  createdAtTx: Bytes!
}

type Vote @entity(immutable: true) {
  id: Bytes!
  governor: Governor!
  proposal: Proposal!
  voter: Bytes!
  support: Int!
  weight: BigInt!
  reason: String
  params: Bytes
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}

type TimelockOperation @entity(immutable: false) {
  id: String! # timelock address + "-" + operation id + "-" + index
  timelock: Timelock!
  operationId: Bytes!
  index: BigInt!
  target: Bytes
  value: BigInt
  data: Bytes
  predecessor: Bytes
  delay: BigInt
  executed: Boolean!
  cancelled: Boolean!
  scheduledAtBlock: BigInt
  scheduledAtTimestamp: BigInt
  scheduledAtTx: Bytes
  executedAtBlock: BigInt
  executedAtTimestamp: BigInt
  executedAtTx: Bytes
}

# Every config/admin/boilerplate event (owner setters, Initialized, Upgraded, ownership and role
# changes, ...) in one uniform shape, queryable by contract and event name.
type AdminEvent @entity(immutable: true) {
  id: Bytes!
  contractAddress: Bytes!
  contractName: String!
  eventName: String!
  param0: String
  param1: String
  param2: String
  param3: String
  blockNumber: BigInt!
  timestamp: BigInt!
  txHash: Bytes!
}
'''

# ---------------------------------------------------------------- shared helpers
HELPERS = {
'admin.ts': r'''import { Bytes, ethereum } from "@graphprotocol/graph-ts";
import { AdminEvent } from "../generated/schema";

export function eventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

export function logAdminEvent(
  event: ethereum.Event,
  contractName: string,
  eventName: string,
  param0: string | null = null,
  param1: string | null = null,
  param2: string | null = null,
  param3: string | null = null
): void {
  let e = new AdminEvent(eventId(event));
  e.contractAddress = event.address;
  e.contractName = contractName;
  e.eventName = eventName;
  e.param0 = param0;
  e.param1 = param1;
  e.param2 = param2;
  e.param3 = param3;
  e.blockNumber = event.block.number;
  e.timestamp = event.block.timestamp;
  e.txHash = event.transaction.hash;
  e.save();
}

export function boolToString(b: boolean): string {
  return b ? "true" : "false";
}
''',
'token-meta.ts': r'''import { Address, BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { Token } from "../generated/schema";
import { DuckToken } from "../generated/DuckBondingCurve/DuckToken";
import { ensureQuotePrice } from "./discovery";

// Builds a Token from what the token contract reports about itself. Every read is a try_ call, so a
// token that is not initialised yet leaves the field null rather than failing the block.
export function newToken(address: Address, family: string, creator: Address, quoteToken: Address, event: ethereum.Event): Token {
  let t = new Token(address);
  t.family = family;
  t.creator = creator;
  t.quoteToken = quoteToken;

  let c = DuckToken.bind(address);
  let name = c.try_name();
  if (!name.reverted) t.name = name.value;
  let symbol = c.try_symbol();
  if (!symbol.reverted) t.symbol = symbol.value;
  let supply = c.try_totalSupply();
  if (!supply.reverted) t.totalSupply = supply.value;
  let decimals = c.try_decimals();
  t.decimals = decimals.reverted ? 18 : decimals.value;
  let meta = c.try_metaURI();
  if (!meta.reverted) t.metaUri = meta.value;

  t.burnedSupply = BigInt.zero();
  t.hasPool = false;
  t.migrated = false;
  t.volumeAllTime = BigInt.zero();
  t.volumeUSDAllTime = BigDecimal.zero();
  t.holderCount = 0;
  t.createdAtBlock = event.block.number;
  t.createdAtTimestamp = event.block.timestamp;
  t.createdAtTx = event.transaction.hash;
  ensureQuotePrice(quoteToken, event);
  return t;
}
''',
'normalize.ts': r'''import { BigDecimal, BigInt, ethereum } from "@graphprotocol/graph-ts";
import { Token, TokenHourData } from "../generated/schema";
import { ensureQuotePrice } from "./discovery";
import { quoteDecimals, quoteUsd } from "./pricing";

const HOUR = BigInt.fromI32(3600);

function toHuman(raw: BigInt, decimals: i32): BigDecimal {
  return raw.toBigDecimal().div(BigInt.fromI32(10).pow(decimals as u8).toBigDecimal());
}

// USD value of one trade; either field is null when the quote token has no reference price yet.
export class TradeValue {
  priceUSD: BigDecimal | null = null;
  volumeUSD: BigDecimal | null = null;
}

// One price/volume series for a token across both of its trading venues: the bonding curve, then
// its v4 pool. Saves the token.
export function recordTrade(token: Token, event: ethereum.Event, quoteRaw: BigInt, tokenRaw: BigInt): TradeValue {
  let value = new TradeValue();
  let timestamp = event.block.timestamp;
  token.lastTradeAt = timestamp;

  let quoteHuman = toHuman(quoteRaw, quoteDecimals(token.quoteToken));
  let hasPrice = !tokenRaw.isZero();
  let price = BigDecimal.zero();
  if (hasPrice) {
    price = quoteHuman.div(toHuman(tokenRaw, token.decimals));
    token.lastPrice = price;
  }
  token.volumeAllTime = token.volumeAllTime.plus(quoteRaw);

  let usd = quoteUsd(token.quoteToken);
  if (usd === null) {
    // No reference price yet: try discovering one (rate-limited), then look again.
    ensureQuotePrice(token.quoteToken, event);
    usd = quoteUsd(token.quoteToken);
  }
  let hasUsd = usd !== null;
  let quoteUsdPrice = BigDecimal.zero();
  let volumeUSD = BigDecimal.zero();
  let priceUSD = BigDecimal.zero();
  if (hasUsd) {
    quoteUsdPrice = usd as BigDecimal;
    volumeUSD = quoteHuman.times(quoteUsdPrice);
    value.volumeUSD = volumeUSD;
    token.volumeUSDAllTime = token.volumeUSDAllTime.plus(volumeUSD);
    if (hasPrice) {
      priceUSD = price.times(quoteUsdPrice);
      value.priceUSD = priceUSD;
      token.lastPriceUSD = priceUSD;
      if (token.totalSupply !== null) {
        let circulating = token.totalSupply!.minus(token.burnedSupply);
        token.marketCapUSD = priceUSD.times(toHuman(circulating, token.decimals));
      }
    }
  }
  token.save();

  let hourIndex = timestamp.div(HOUR);
  let id = token.id.toHexString() + "-" + hourIndex.toString();
  let bucket = TokenHourData.load(id);
  if (bucket == null) {
    bucket = new TokenHourData(id);
    bucket.token = token.id;
    bucket.hourStartUnix = hourIndex.times(HOUR);
    bucket.volumeQuote = BigInt.zero();
    bucket.volumeUSD = BigDecimal.zero();
  }
  bucket.volumeQuote = bucket.volumeQuote.plus(quoteRaw);
  if (hasPrice) bucket.closePrice = price;
  if (hasUsd) {
    bucket.volumeUSD = bucket.volumeUSD.plus(volumeUSD);
    if (hasPrice) bucket.closePriceUSD = priceUSD;
  }
  bucket.save();
  return value;
}
''',
'pricing.ts': r'''import { Address, BigDecimal, BigInt, Bytes, dataSource, ethereum } from "@graphprotocol/graph-ts";
import { DiscoveredReferencePool, EthReferencePool, QuotePrice, QuoteToken } from "../generated/schema";
import { ERC20 } from "../generated/DuckBondingCurve/ERC20";
import { KIND_ETH_STABLE, KIND_TOKEN_ETH, RefPool, V4RefPool, refPools, stableTokens, v4RefPools, wrappedNative } from "./price-config";

const Q96 = BigInt.fromI32(2).pow(96).toBigDecimal();
const ZERO_HEX = "0x0000000000000000000000000000000000000000";

function pow10(n: i32): BigDecimal {
  return BigInt.fromI32(10).pow(n as u8).toBigDecimal();
}

export function toHuman(raw: BigInt, decimals: i32): BigDecimal {
  return raw.toBigDecimal().div(pow10(decimals));
}

// Decimals of a quote token, read from the token once and cached. Native ETH is address(0).
export function quoteDecimals(quote: Bytes | null): i32 {
  if (quote === null) return 18;
  let address = Address.fromBytes(quote as Bytes);
  if (address.equals(Address.zero())) return 18;
  let cached = QuoteToken.load(address);
  if (cached != null) return cached.decimals;

  let q = new QuoteToken(address);
  let erc20 = ERC20.bind(address);
  let d = erc20.try_decimals();
  q.decimals = d.reverted ? 18 : d.value;
  let sym = erc20.try_symbol();
  if (!sym.reverted) q.symbol = sym.value;
  q.save();
  return q.decimals;
}

function originOf(discovered: boolean): string {
  return discovered ? "DISCOVERED" : "CURATED";
}

// token1 per token0 from a pool's sqrtPriceX96, adjusted for both tokens' decimals.
export function price1Per0(sqrtPriceX96: BigInt, dec0: i32, dec1: i32): BigDecimal {
  let s = sqrtPriceX96.toBigDecimal().div(Q96);
  let raw = s.times(s);
  let e = dec0 - dec1;
  if (e > 0) return raw.times(pow10(e));
  if (e < 0) return raw.div(pow10(-e));
  return raw;
}

export function findRefPool(pool: Address): RefPool | null {
  let pools = refPools(dataSource.network());
  let hex = pool.toHexString();
  for (let i = 0; i < pools.length; i++) {
    if (pools[i].pool == hex) return pools[i];
  }
  let d = DiscoveredReferencePool.load(pool);
  if (d == null) return null;
  if (d.isV4) return null;
  let r = new RefPool(hex, d.token.toHexString(), d.kind, d.pricedIsToken0, d.dec0, d.dec1);
  r.discovered = true;
  return r;
}

export function findV4RefPool(poolId: Bytes): V4RefPool | null {
  let pools = v4RefPools(dataSource.network());
  let hex = poolId.toHexString();
  for (let i = 0; i < pools.length; i++) {
    if (pools[i].poolId == hex) return pools[i];
  }
  let d = DiscoveredReferencePool.load(poolId);
  if (d == null) return null;
  if (!d.isV4) return null;
  let r = new V4RefPool(hex, d.token.toHexString(), d.dec1);
  r.discovered = true;
  return r;
}

export function writeQuotePrice(token: Address, priceUSD: BigDecimal | null, priceETH: BigDecimal | null, source: Bytes, event: ethereum.Event, origin: string, depthUSD: BigDecimal | null): void {
  let loaded = QuotePrice.load(token);
  if (loaded == null) loaded = new QuotePrice(token);
  let q = loaded as QuotePrice;
  q.priceUSD = priceUSD;
  q.priceETH = priceETH;
  q.source = source;
  q.origin = origin;
  if (depthUSD !== null) q.depthUSD = depthUSD;
  q.updatedAt = event.block.timestamp;
  q.updatedAtBlock = event.block.number;
  q.save();
}

function updateEthPrice(pool: Address, priceUSD: BigDecimal, liquidity: BigInt, event: ethereum.Event): void {
  let loaded = EthReferencePool.load(pool);
  if (loaded == null) loaded = new EthReferencePool(pool);
  let ref = loaded as EthReferencePool;
  ref.priceUSD = priceUSD;
  ref.liquidity = liquidity;
  ref.updatedAt = event.block.timestamp;
  ref.save();

  // ETH/USD across every ETH/stablecoin reference pool on this network, weighted by in-range liquidity.
  let network = dataSource.network();
  let pools = refPools(network);
  let weighted = BigDecimal.zero();
  let totalWeight = BigDecimal.zero();
  for (let i = 0; i < pools.length; i++) {
    if (pools[i].kind != KIND_ETH_STABLE) continue;
    let other = EthReferencePool.load(Address.fromString(pools[i].pool));
    if (other == null) continue;
    let w = other.liquidity.toBigDecimal();
    weighted = weighted.plus(other.priceUSD.times(w));
    totalWeight = totalWeight.plus(w);
  }
  if (totalWeight.equals(BigDecimal.zero())) return;
  let ethUSD = weighted.div(totalWeight);
  writeQuotePrice(Address.zero(), ethUSD, null, pool, event, "CURATED", null);
  writeQuotePrice(Address.fromString(wrappedNative(network)), ethUSD, null, pool, event, "CURATED", null);
}

// A swap in a v3 reference pool.
export function recordReferenceSwap(ref: RefPool, sqrtPriceX96: BigInt, liquidity: BigInt, event: ethereum.Event): void {
  if (liquidity.isZero() || sqrtPriceX96.isZero()) return;
  let p1per0 = price1Per0(sqrtPriceX96, ref.dec0, ref.dec1);
  if (p1per0.equals(BigDecimal.zero())) return;
  // Price of the priced token in units of the pool's other token (ETH or a $1 stablecoin).
  let price = ref.pricedIsToken0 ? p1per0 : BigDecimal.fromString("1").div(p1per0);
  if (ref.kind == KIND_ETH_STABLE) {
    updateEthPrice(event.address, price, liquidity, event);
  } else if (ref.kind == KIND_TOKEN_ETH) {
    writeQuotePrice(Address.fromString(ref.token), null, price, event.address, event, originOf(ref.discovered), null);
  } else {
    writeQuotePrice(Address.fromString(ref.token), price, null, event.address, event, originOf(ref.discovered), null);
  }
}

// A swap in a v4 reference pool against native ETH, which is always currency0.
export function recordV4ReferenceSwap(ref: V4RefPool, sqrtPriceX96: BigInt, liquidity: BigInt, event: ethereum.Event): void {
  if (liquidity.isZero() || sqrtPriceX96.isZero()) return;
  let tokenPerEth = price1Per0(sqrtPriceX96, 18, ref.tokenDecimals);
  if (tokenPerEth.equals(BigDecimal.zero())) return;
  let priceETH = BigDecimal.fromString("1").div(tokenPerEth);
  writeQuotePrice(Address.fromString(ref.token), null, priceETH, Bytes.fromHexString(ref.poolId), event, originOf(ref.discovered), null);
}

// Current USD price of a quote token, or null if it has no reference price yet.
export function quoteUsd(quote: Bytes | null): BigDecimal | null {
  let network = dataSource.network();
  let hex = ZERO_HEX;
  if (quote !== null) hex = (quote as Bytes).toHexString();

  let stables = stableTokens(network);
  for (let i = 0; i < stables.length; i++) {
    if (stables[i] == hex) return BigDecimal.fromString("1");
  }
  if (hex == wrappedNative(network)) hex = ZERO_HEX;

  let q = QuotePrice.load(Address.fromString(hex));
  if (q == null) return null;
  if (q.priceUSD !== null) return q.priceUSD;
  let priceETH = q.priceETH;
  if (priceETH === null) return null;
  let native = QuotePrice.load(Address.zero());
  if (native == null) return null;
  let ethUSD = native.priceUSD;
  if (ethUSD === null) return null;
  return (priceETH as BigDecimal).times(ethUSD as BigDecimal);
}
''',
'discovery.ts': r'''import { Address, BigDecimal, BigInt, ByteArray, Bytes, crypto, dataSource, ethereum } from "@graphprotocol/graph-ts";
import { DiscoveredReferencePool, QuoteDiscovery, QuotePrice } from "../generated/schema";
import { DiscoveredV3Pool } from "../generated/templates";
import { UniswapV3Factory } from "../generated/DuckBondingCurve/UniswapV3Factory";
import { UniswapV3Pool } from "../generated/DuckBondingCurve/UniswapV3Pool";
import { V4StateReader } from "../generated/DuckBondingCurve/V4StateReader";
import { ERC20 } from "../generated/DuckBondingCurve/ERC20";
import { KIND_TOKEN_ETH, KIND_TOKEN_STABLE, refPools, stableTokens, v3Factory, v4PoolManager, v4RefPools, wrappedNative } from "./price-config";
import { price1Per0, quoteDecimals, quoteUsd, toHuman, writeQuotePrice } from "./pricing";

// Finds a USD reference for a quote token with no curated one -- in practice an arbitrary token picked
// in the launcher. The token's Uniswap pools are read at the triggering event's block: v3 pools against
// WETH or a $1 stablecoin through the v3 factory the chain's Universal Router uses, and v4 pools against
// native ETH over common fee/tick-spacing pairs. The deepest, measured by USD on its ETH/stablecoin side,
// becomes the reference. No minimum depth is applied; the result is marked DISCOVERED.

const RETRY_SECONDS = BigInt.fromI32(6 * 3600);
const POOLS_SLOT: i32 = 6; // PoolManager._pools
const V3_FEES: i32[] = [100, 500, 2500, 3000, 10000];
const V4_FEES: i32[] = [100, 500, 3000, 10000, 2500, 2500, 1000, 1000, 5000, 20000, 50000];
const V4_SPACINGS: i32[] = [1, 10, 60, 200, 25, 50, 10, 20, 100, 400, 1000];
// v4 depth is the ETH a pool holds for a +10% price move; sqrt(1.1) bounds that range.
const SQRT_1_1 = BigDecimal.fromString("1.0488088481701515469914535136799");
const Q96 = BigInt.fromI32(2).pow(96).toBigDecimal();
const ZERO_HEX = "0x0000000000000000000000000000000000000000";

class Candidate {
  pool: Bytes = Bytes.empty();
  isV4: boolean = false;
  kind: i32 = 0;
  pricedIsToken0: boolean = false;
  dec0: i32 = 18;
  dec1: i32 = 18;
  depthUSD: BigDecimal = BigDecimal.zero();
  sqrtPriceX96: BigInt = BigInt.zero();
}

function isKnownQuote(hex: string, network: string): boolean {
  if (hex == ZERO_HEX) return true;
  if (hex == wrappedNative(network)) return true;
  let stables = stableTokens(network);
  for (let i = 0; i < stables.length; i++) {
    if (stables[i] == hex) return true;
  }
  let v3 = refPools(network);
  for (let i = 0; i < v3.length; i++) {
    if (v3[i].token == hex) return true;
  }
  let v4 = v4RefPools(network);
  for (let i = 0; i < v4.length; i++) {
    if (v4[i].token == hex) return true;
  }
  return false;
}

function addressWord(a: Address): Bytes {
  let out = new ByteArray(32);
  for (let i = 0; i < 20; i++) out[12 + i] = a[i];
  return Bytes.fromByteArray(out);
}

function uintWord(v: i32): Bytes {
  let out = new ByteArray(32);
  out[31] = (v & 0xff) as u8;
  out[30] = ((v >> 8) & 0xff) as u8;
  out[29] = ((v >> 16) & 0xff) as u8;
  out[28] = ((v >> 24) & 0xff) as u8;
  return Bytes.fromByteArray(out);
}

// A big-endian 32-byte storage slot plus n.
function slotPlus(slot: ByteArray, n: i32): Bytes {
  let out = new ByteArray(32);
  for (let i = 0; i < 32; i++) out[i] = slot[i];
  let carry = n;
  for (let i = 31; i >= 0; i--) {
    if (carry == 0) break;
    let sum = (out[i] as i32) + carry;
    out[i] = (sum & 0xff) as u8;
    carry = sum >> 8;
  }
  return Bytes.fromByteArray(out);
}

// The low `count` bytes of a big-endian 32-byte word, as an unsigned integer.
function lowBytes(word: Bytes, count: i32): BigInt {
  let littleEndian = new ByteArray(count);
  for (let i = 0; i < count; i++) littleEndian[i] = word[31 - i];
  return BigInt.fromUnsignedBytes(littleEndian);
}

function ethUsdOrZero(): BigDecimal {
  let eth = quoteUsd(Address.zero());
  if (eth === null) return BigDecimal.zero();
  return eth as BigDecimal;
}

// Finds a reference pool for `quote` if it needs one. Cheap when it does not: known quote tokens and
// already-priced ones return immediately, and failed attempts are retried at most every 6 hours.
export function ensureQuotePrice(quote: Bytes | null, event: ethereum.Event): void {
  if (quote === null) return;
  let token = Address.fromBytes(quote as Bytes);
  let network = dataSource.network();
  if (isKnownQuote(token.toHexString(), network)) return;
  if (QuotePrice.load(token) != null) return;
  let previous = QuoteDiscovery.load(token);
  if (previous != null) {
    if (previous.found) return;
    if (event.block.timestamp.minus(previous.lastAttemptAt).lt(RETRY_SECONDS)) return;
  }
  discover(token, network, event);
}

function discover(token: Address, network: string, event: ethereum.Event): void {
  let tokenHex = token.toHexString();
  let tokenDec = quoteDecimals(token);
  let ethUSD = ethUsdOrZero();
  let best = new Candidate();
  let found = false;

  // v3 pools against WETH, then each $1 stablecoin.
  let bases = new Array<string>(0);
  bases.push(wrappedNative(network));
  let stables = stableTokens(network);
  for (let i = 0; i < stables.length; i++) bases.push(stables[i]);
  let factory = UniswapV3Factory.bind(Address.fromString(v3Factory(network)));
  for (let b = 0; b < bases.length; b++) {
    let baseHex = bases[b];
    let base = Address.fromString(baseHex);
    let baseIsEth = b == 0;
    let baseDec = quoteDecimals(base);
    for (let f = 0; f < V3_FEES.length; f++) {
      let poolResult = factory.try_getPool(token, base, V3_FEES[f]);
      if (poolResult.reverted) continue;
      let poolAddress = poolResult.value;
      if (poolAddress.equals(Address.zero())) continue;
      let pool = UniswapV3Pool.bind(poolAddress);
      let slot0 = pool.try_slot0();
      if (slot0.reverted) continue;
      let liquidity = pool.try_liquidity();
      if (liquidity.reverted) continue;
      if (liquidity.value.isZero()) continue;
      let balance = ERC20.bind(base).try_balanceOf(poolAddress);
      if (balance.reverted) continue;
      let depth = toHuman(balance.value, baseDec);
      if (baseIsEth) depth = depth.times(ethUSD);
      if (found && !depth.gt(best.depthUSD)) continue;

      let c = new Candidate();
      c.pool = poolAddress;
      c.kind = KIND_TOKEN_STABLE;
      if (baseIsEth) c.kind = KIND_TOKEN_ETH;
      c.pricedIsToken0 = tokenHex < baseHex; // v3 orders tokens by address
      c.dec0 = baseDec;
      c.dec1 = tokenDec;
      if (c.pricedIsToken0) {
        c.dec0 = tokenDec;
        c.dec1 = baseDec;
      }
      c.depthUSD = depth;
      c.sqrtPriceX96 = slot0.value.getSqrtPriceX96();
      best = c;
      found = true;
    }
  }

  // v4 pools against native ETH, which is always currency0.
  let manager = V4StateReader.bind(Address.fromString(v4PoolManager(network)));
  for (let i = 0; i < V4_FEES.length; i++) {
    let key = addressWord(Address.zero())
      .concat(addressWord(token))
      .concat(uintWord(V4_FEES[i]))
      .concat(uintWord(V4_SPACINGS[i]))
      .concat(addressWord(Address.zero()));
    let poolId = Bytes.fromByteArray(crypto.keccak256(key));
    let stateSlot = crypto.keccak256(poolId.concat(uintWord(POOLS_SLOT)));
    let slot0 = manager.try_extsload(Bytes.fromByteArray(stateSlot));
    if (slot0.reverted) continue;
    let sqrtPriceX96 = lowBytes(slot0.value, 20);
    if (sqrtPriceX96.isZero()) continue;
    let liquidityWord = manager.try_extsload(slotPlus(stateSlot, 3));
    if (liquidityWord.reverted) continue;
    let liquidity = lowBytes(liquidityWord.value, 16);
    if (liquidity.isZero()) continue;

    let sp = sqrtPriceX96.toBigDecimal().div(Q96);
    let one = BigDecimal.fromString("1");
    let ethDepth = liquidity.toBigDecimal().times(one.div(sp).minus(one.div(sp.times(SQRT_1_1)))).div(BigInt.fromI32(10).pow(18).toBigDecimal());
    let depth = ethDepth.times(ethUSD);
    if (found && !depth.gt(best.depthUSD)) continue;

    let c = new Candidate();
    c.pool = poolId;
    c.isV4 = true;
    c.kind = KIND_TOKEN_ETH;
    c.pricedIsToken0 = false;
    c.dec0 = 18;
    c.dec1 = tokenDec;
    c.depthUSD = depth;
    c.sqrtPriceX96 = sqrtPriceX96;
    best = c;
    found = true;
  }

  let previous = QuoteDiscovery.load(token);
  let attempts = 0;
  if (previous != null) attempts = previous.attempts;
  let record = new QuoteDiscovery(token);
  record.attempts = attempts + 1;
  record.lastAttemptAt = event.block.timestamp;
  record.found = found;
  if (found) record.pool = best.pool;
  record.save();
  if (!found) return;

  let ref = new DiscoveredReferencePool(best.pool);
  ref.isV4 = best.isV4;
  ref.token = token;
  ref.kind = best.kind;
  ref.pricedIsToken0 = best.pricedIsToken0;
  ref.dec0 = best.dec0;
  ref.dec1 = best.dec1;
  ref.depthUSD = best.depthUSD;
  ref.discoveredAt = event.block.timestamp;
  ref.discoveredAtBlock = event.block.number;
  ref.save();
  if (!best.isV4) DiscoveredV3Pool.create(Address.fromBytes(best.pool));

  // Seed the price from the pool's current state so this event's own trade already has a USD value.
  let p1per0 = price1Per0(best.sqrtPriceX96, best.dec0, best.dec1);
  if (p1per0.equals(BigDecimal.zero())) return;
  let price = p1per0;
  if (!best.pricedIsToken0) price = BigDecimal.fromString("1").div(p1per0);
  if (best.kind == KIND_TOKEN_STABLE) {
    writeQuotePrice(token, price, null, best.pool, event, "DISCOVERED", best.depthUSD);
  } else {
    writeQuotePrice(token, null, price, best.pool, event, "DISCOVERED", best.depthUSD);
  }
}
''',
'ref-pool.ts': r'''// Swaps in the fixed Uniswap v3 pools used as USD price references. Every reference pool shares this
// handler and ABI; the pool's role comes from price-config.ts.
import { Swap } from "../generated/PriceReference0/UniswapV3Pool";
import { findRefPool, recordReferenceSwap } from "./pricing";

export function handleSwap(event: Swap): void {
  let ref = findRefPool(event.address);
  if (ref == null) return;
  recordReferenceSwap(ref, event.params.sqrtPriceX96, event.params.liquidity, event);
}
''',
}

# ---------------------------------------------------------------- rich handlers per mapping file
# Each entry: (extra imports, body). Event classes are imported automatically -- never import them here.
RICH = {
'duck-bonding-curve': (r'''import { BigInt } from "@graphprotocol/graph-ts";
import { Token, Trade, Migration, EmergencyMigration, MigrationFailure, CurveFeeClaim } from "../generated/schema";
import { DuckToken as DuckTokenTemplate } from "../generated/templates";
import { eventId } from "./admin";
import { newToken } from "./token-meta";
import { recordTrade } from "./normalize";
''', r'''
export function handleTokenRegistered(event: TokenRegistered): void {
  let t = newToken(event.params.token, "BondingCurve", event.params.creator, event.params.quoteToken, event);
  t.totalSupply = event.params.totalSupply;
  t.virtualQuote = event.params.virtualQuote;
  t.migrationTarget = event.params.migrationTarget;
  t.raisedQuote = BigInt.zero();
  t.bcTokensSold = BigInt.zero();
  t.save();
}

// TokenCreated follows TokenRegistered in the same createToken call. Starting the token template
// only here gives each token exactly one dynamic data source (a second would double-count holders).
export function handleTokenCreated(event: TokenCreated): void {
  DuckTokenTemplate.create(event.params.token);
  logAdminEvent(event, CONTRACT, "TokenCreated", event.params.token.toHexString(), event.params.creator.toHexString(), event.params.totalSupply.toString());
}

export function handleTokenBought(event: TokenBought): void {
  let tr = new Trade(eventId(event));
  tr.token = event.params.token;
  tr.trader = event.params.buyer;
  tr.isBuy = true;
  tr.quoteAmount = event.params.quoteIn;
  tr.tokenAmount = event.params.tokensOut;
  tr.raisedQuote = event.params.raisedQuote;
  tr.blockNumber = event.block.number;
  tr.timestamp = event.block.timestamp;
  tr.txHash = event.transaction.hash;

  let t = Token.load(event.params.token);
  if (t != null) {
    t.raisedQuote = event.params.raisedQuote;
    t.bcTokensSold = t.bcTokensSold!.plus(event.params.tokensOut);
    let value = recordTrade(t, event, event.params.quoteIn, event.params.tokensOut);
    tr.priceUSD = value.priceUSD;
    tr.volumeUSD = value.volumeUSD;
  }
  tr.save();
}

export function handleTokenSold(event: TokenSold): void {
  let tr = new Trade(eventId(event));
  tr.token = event.params.token;
  tr.trader = event.params.seller;
  tr.isBuy = false;
  tr.quoteAmount = event.params.quoteOut;
  tr.tokenAmount = event.params.tokensIn;
  tr.raisedQuote = event.params.raisedQuote;
  tr.blockNumber = event.block.number;
  tr.timestamp = event.block.timestamp;
  tr.txHash = event.transaction.hash;

  let t = Token.load(event.params.token);
  if (t != null) {
    t.raisedQuote = event.params.raisedQuote;
    t.bcTokensSold = t.bcTokensSold!.minus(event.params.tokensIn);
    let value = recordTrade(t, event, event.params.quoteOut, event.params.tokensIn);
    tr.priceUSD = value.priceUSD;
    tr.volumeUSD = value.volumeUSD;
  }
  tr.save();
}

export function handleTokenMigrated(event: TokenMigrated): void {
  let m = new Migration(eventId(event));
  m.token = event.params.token;
  m.poolId = event.params.poolId;
  m.liquidityQuote = event.params.liquidityQuote;
  m.liquidityTokens = event.params.liquidityTokens;
  m.blockNumber = event.block.number;
  m.timestamp = event.block.timestamp;
  m.txHash = event.transaction.hash;
  m.save();

  let t = Token.load(event.params.token);
  if (t == null) return;
  t.migrated = true;
  t.hasPool = true;
  t.poolId = event.params.poolId;
  t.save();
}

export function handleEmergencyMigrated(event: EmergencyMigrated): void {
  let m = new EmergencyMigration(eventId(event));
  m.token = event.params.token;
  m.to = event.params.to;
  m.quoteAmount = event.params.quoteAmount;
  m.tokenAmount = event.params.tokenAmount;
  m.blockNumber = event.block.number;
  m.timestamp = event.block.timestamp;
  m.txHash = event.transaction.hash;
  m.save();
}

export function handleMigrationFailed(event: MigrationFailed): void {
  let m = new MigrationFailure(eventId(event));
  m.token = event.params.token;
  m.blockNumber = event.block.number;
  m.timestamp = event.block.timestamp;
  m.txHash = event.transaction.hash;
  m.save();
}

export function handleCurveFeeClaimed(event: CurveFeeClaimed): void {
  let c = new CurveFeeClaim(eventId(event));
  c.token = event.params.token;
  c.creator = event.params.creator;
  c.creatorAmount = event.params.creatorAmount;
  c.platformAmount = event.params.platformAmount;
  c.blockNumber = event.block.number;
  c.timestamp = event.block.timestamp;
  c.txHash = event.transaction.hash;
  c.save();
}
'''),

'duck-launcher': (r'''import { Launch, PoolRegistration } from "../generated/schema";
import { DuckToken as DuckTokenTemplate } from "../generated/templates";
import { newToken } from "./token-meta";
''', r'''
export function handleTokenLaunched(event: TokenLaunched): void {
  let t = newToken(event.params.token, "Launcher", event.params.creator, event.params.quoteToken, event);
  t.hasPool = true;
  t.poolId = event.params.poolId;
  t.hook = event.params.hook;
  t.positionManager = event.params.positionManager;
  // The hook registers the pool earlier in this same transaction, before this Token existed.
  let reg = PoolRegistration.load(event.params.poolId);
  if (reg != null) t.hookFeeBps = reg.hookFeeBps;
  t.save();

  let l = new Launch(event.params.token);
  l.token = event.params.token;
  l.creator = event.params.creator;
  l.positionManager = event.params.positionManager;
  l.quoteToken = event.params.quoteToken;
  l.hook = event.params.hook;
  l.poolId = event.params.poolId;
  l.blockNumber = event.block.number;
  l.timestamp = event.block.timestamp;
  l.txHash = event.transaction.hash;
  l.save();

  DuckTokenTemplate.create(event.params.token);
}
'''),

'duck-crowdfund': (r'''import { Address, BigInt } from "@graphprotocol/graph-ts";
import { DuckCrowdfund } from "../generated/DuckCrowdfund/DuckCrowdfund";
import { Campaign, Contribution, Claim, Refund } from "../generated/schema";
import { DuckToken as DuckTokenTemplate } from "../generated/templates";
import { eventId } from "./admin";
import { newToken } from "./token-meta";
''', r'''
function campaignEntityId(crowdfund: Address, campaignId: BigInt): string {
  return crowdfund.toHexString() + "-" + campaignId.toString();
}

export function handleCampaignCreated(event: CampaignCreated): void {
  let t = newToken(event.params.token, "Crowdfund", event.params.creator, event.params.dexQuoteAsset, event);
  if (t.name == null) t.name = event.params.name;
  if (t.symbol == null) t.symbol = event.params.symbol;

  let c = new Campaign(campaignEntityId(event.address, event.params.campaignId));
  c.campaignId = event.params.campaignId;
  c.creator = event.params.creator;
  c.token = event.params.token;
  c.name = event.params.name;
  c.symbol = event.params.symbol;
  c.dexQuoteAsset = event.params.dexQuoteAsset;
  c.goal = event.params.goal;
  c.startTime = event.params.startTime;
  c.deadline = event.params.deadline;
  c.totalRaised = BigInt.zero();
  c.finalized = false;
  c.succeeded = false;
  let meta = DuckCrowdfund.bind(event.address).try_getCampaignMeta(event.params.campaignId);
  if (!meta.reverted) {
    c.metaUri = meta.value.getMetaURI();
    c.totalSupply = meta.value.getTotalSupply();
    c.contributorBps = meta.value.getContributorBps();
    c.lpBps = meta.value.getLpBps();
    c.hookFeeBps = meta.value.getHookFeeBps();
    c.vaultBps = meta.value.getVaultBps();
    t.totalSupply = meta.value.getTotalSupply();
    if (t.metaUri == null) t.metaUri = meta.value.getMetaURI();
  }
  c.createdAtBlock = event.block.number;
  c.createdAtTimestamp = event.block.timestamp;
  c.createdAtTx = event.transaction.hash;
  c.save();
  t.save();

  DuckTokenTemplate.create(event.params.token);
}

export function handleContributed(event: Contributed): void {
  let id = campaignEntityId(event.address, event.params.campaignId);
  let c = Campaign.load(id);
  if (c != null) {
    c.totalRaised = c.totalRaised.plus(event.params.amount);
    c.save();
  }
  let x = new Contribution(eventId(event));
  x.campaign = id;
  x.contributor = event.params.contributor;
  x.amount = event.params.amount;
  x.blockNumber = event.block.number;
  x.timestamp = event.block.timestamp;
  x.txHash = event.transaction.hash;
  x.save();
}

export function handleCampaignSucceeded(event: CampaignSucceeded): void {
  let c = Campaign.load(campaignEntityId(event.address, event.params.campaignId));
  if (c == null) return;
  c.finalized = true;
  c.succeeded = true;
  c.totalRaised = event.params.totalRaised;
  c.save();
}

export function handleCampaignFailed(event: CampaignFailed): void {
  let c = Campaign.load(campaignEntityId(event.address, event.params.campaignId));
  if (c == null) return;
  c.finalized = true;
  c.succeeded = false;
  c.totalRaised = event.params.totalRaised;
  c.save();
}

export function handleClaimed(event: Claimed): void {
  let x = new Claim(eventId(event));
  x.campaign = campaignEntityId(event.address, event.params.campaignId);
  x.contributor = event.params.contributor;
  x.amount = event.params.amount;
  x.blockNumber = event.block.number;
  x.timestamp = event.block.timestamp;
  x.txHash = event.transaction.hash;
  x.save();
}

export function handleRefunded(event: Refunded): void {
  let x = new Refund(eventId(event));
  x.campaign = campaignEntityId(event.address, event.params.campaignId);
  x.contributor = event.params.contributor;
  x.amount = event.params.amount;
  x.blockNumber = event.block.number;
  x.timestamp = event.block.timestamp;
  x.txHash = event.transaction.hash;
  x.save();
}
'''),

'duck-hook-v4': (r'''import { Bytes } from "@graphprotocol/graph-ts";
import { PoolRegistration, HookFeeClaim, CTOEvent, HookBuybackBurn, Token } from "../generated/schema";
import { eventId } from "./admin";
''', r'''
function tokenForPool(poolId: Bytes): Bytes | null {
  let reg = PoolRegistration.load(poolId);
  if (reg == null) return null;
  return reg.token;
}

export function handlePoolRegistered(event: PoolRegistered): void {
  let p = new PoolRegistration(event.params.poolId);
  p.poolId = event.params.poolId;
  p.token = event.params.token;
  p.creator = event.params.creator;
  p.hook = event.address;
  p.hookFeeBps = event.params.hookFeeBps;
  p.blockNumber = event.block.number;
  p.timestamp = event.block.timestamp;
  p.txHash = event.transaction.hash;
  p.save();

  // Bonding-curve tokens reach this on migration and crowdfund tokens on success, so this is where
  // they learn their pool. Launcher tokens register before their Token exists; TokenLaunched covers them.
  let t = Token.load(event.params.token);
  if (t == null) return;
  t.hasPool = true;
  t.poolId = event.params.poolId;
  t.hook = event.address;
  t.hookFeeBps = event.params.hookFeeBps;
  t.save();
}

export function handleFeesClaimed(event: FeesClaimed): void {
  let f = new HookFeeClaim(eventId(event));
  f.poolId = event.params.poolId;
  f.token = tokenForPool(event.params.poolId);
  f.amount = event.params.amount;
  f.blockNumber = event.block.number;
  f.timestamp = event.block.timestamp;
  f.txHash = event.transaction.hash;
  f.save();
}

export function handleCTOApplied(event: CTOApplied): void {
  let c = new CTOEvent(eventId(event));
  c.type = "Applied";
  c.poolId = event.params.poolId;
  c.token = tokenForPool(event.params.poolId);
  c.applicant = event.params.applicant;
  c.newCreator = event.params.newCreator;
  c.paid = event.params.paid;
  c.blockNumber = event.block.number;
  c.timestamp = event.block.timestamp;
  c.txHash = event.transaction.hash;
  c.save();
}

export function handleCTOApproved(event: CTOApproved): void {
  let tokenId = tokenForPool(event.params.poolId);
  let c = new CTOEvent(eventId(event));
  c.type = "Approved";
  c.poolId = event.params.poolId;
  c.token = tokenId;
  c.newCreator = event.params.newCreator;
  c.blockNumber = event.block.number;
  c.timestamp = event.block.timestamp;
  c.txHash = event.transaction.hash;
  c.save();

  if (tokenId === null) return;
  let t = Token.load(tokenId as Bytes);
  if (t == null) return;
  t.creator = event.params.newCreator;
  t.save();
}

export function handleCTORejected(event: CTORejected): void {
  let c = new CTOEvent(eventId(event));
  c.type = "Rejected";
  c.poolId = event.params.poolId;
  c.token = tokenForPool(event.params.poolId);
  c.applicant = event.params.applicant;
  c.blockNumber = event.block.number;
  c.timestamp = event.block.timestamp;
  c.txHash = event.transaction.hash;
  c.save();
}

export function handleBuybackBurned(event: BuybackBurned): void {
  let b = new HookBuybackBurn(eventId(event));
  b.poolId = event.params.poolId;
  b.token = tokenForPool(event.params.poolId);
  b.quoteSpent = event.params.quoteSpent;
  b.tokensBurned = event.params.tokensBurned;
  b.blockNumber = event.block.number;
  b.timestamp = event.block.timestamp;
  b.txHash = event.transaction.hash;
  b.save();
}
'''),

'pool-manager': (r'''import { BigInt } from "@graphprotocol/graph-ts";
import { PoolRegistration, PoolSwap, Token } from "../generated/schema";
import { eventId } from "./admin";
import { recordTrade } from "./normalize";
import { findV4RefPool, recordV4ReferenceSwap } from "./pricing";

const NATIVE_HEX = "0x0000000000000000000000000000000000000000";
''', r'''
// The PoolManager is the chain-wide v4 singleton, so it emits Swap for every pool. Only pools the
// hook registered belong to DuckProtocol; everything else is skipped.
export function handleSwap(event: Swap): void {
  let ref = findV4RefPool(event.params.id);
  if (ref != null) {
    recordV4ReferenceSwap(ref, event.params.sqrtPriceX96, event.params.liquidity, event);
  }

  let reg = PoolRegistration.load(event.params.id);
  if (reg == null) return;
  let t = Token.load(reg.token);
  if (t == null) return;

  let quoteHex = t.quoteToken !== null ? t.quoteToken!.toHexString() : NATIVE_HEX;
  let tokenIsCurrency0 = t.id.toHexString() < quoteHex; // v4 sorts currencies by address
  let tokenDelta = tokenIsCurrency0 ? event.params.amount0 : event.params.amount1;
  let quoteDelta = tokenIsCurrency0 ? event.params.amount1 : event.params.amount0;

  // Deltas are from the swapper's side: a positive token delta means the swapper received the token.
  let isBuy = tokenDelta.gt(BigInt.zero());
  let tokenAmount = tokenDelta.lt(BigInt.zero()) ? tokenDelta.neg() : tokenDelta;
  let quoteAmount = quoteDelta.lt(BigInt.zero()) ? quoteDelta.neg() : quoteDelta;
  let value = recordTrade(t, event, quoteAmount, tokenAmount);

  let s = new PoolSwap(eventId(event));
  s.token = t.id;
  // event.params.sender is the router that called PoolManager; the signing wallet is the trader.
  s.trader = event.transaction.from;
  s.isBuy = isBuy;
  s.quoteAmount = quoteAmount;
  s.tokenAmount = tokenAmount;
  s.priceUSD = value.priceUSD;
  s.volumeUSD = value.volumeUSD;
  s.blockNumber = event.block.number;
  s.timestamp = event.block.timestamp;
  s.txHash = event.transaction.hash;
  s.save();
}
'''),

'duck-vault-factory': (r'''import { Vault } from "../generated/schema";
import { DuckVault as DuckVaultTemplate } from "../generated/templates";
''', r'''
export function handleVaultCreated(event: VaultCreated): void {
  let v = new Vault(event.params.vault);
  v.token = event.params.token;
  v.family = event.params.family;
  v.creator = event.params.creator;
  v.enabled = false;
  v.createdAtBlock = event.block.number;
  v.createdAtTimestamp = event.block.timestamp;
  v.createdAtTx = event.transaction.hash;
  v.save();
  DuckVaultTemplate.create(event.params.vault);
}
'''),

'duck-vault-config': ('', ''),

'duck-token-governor-factory': (r'''import { Governor, Timelock } from "../generated/schema";
import { DuckTokenGovernor as DuckTokenGovernorTemplate, TimelockControllerUpgradeable as TimelockTemplate } from "../generated/templates";
''', r'''
export function handleGovernorCreated(event: GovernorCreated): void {
  let g = new Governor(event.params.governor);
  g.vault = event.params.vault;
  g.creator = event.params.creator;
  g.createdAtBlock = event.block.number;
  g.createdAtTimestamp = event.block.timestamp;
  g.createdAtTx = event.transaction.hash;
  g.save();
  DuckTokenGovernorTemplate.create(event.params.governor);
}

export function handleTimelockCreated(event: TimelockCreated): void {
  let t = new Timelock(event.params.timelock);
  t.vault = event.params.vault;
  t.createdAtBlock = event.block.number;
  t.createdAtTimestamp = event.block.timestamp;
  t.createdAtTx = event.transaction.hash;
  t.save();
  TimelockTemplate.create(event.params.timelock);
}
'''),

'duck-token': (r'''import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Holder, Token, HolderRewardDeposit, HolderRewardRound, HolderRewardPayout } from "../generated/schema";
import { eventId } from "./admin";

const DEAD = Address.fromString("0x000000000000000000000000000000000000dEaD");
''', r'''
function loadHolder(token: Address, account: Address): Holder {
  let id = token.toHexString() + "-" + account.toHexString();
  let h = Holder.load(id);
  if (h == null) {
    h = new Holder(id);
    h.token = token;
    h.account = account;
    h.balance = BigInt.zero();
  }
  return h as Holder;
}

function adjustHolderCount(token: Address, delta: i32): void {
  let t = Token.load(token);
  if (t == null) return;
  t.holderCount = t.holderCount + delta;
  t.save();
}

export function handleTransfer(event: Transfer): void {
  let token = event.address;

  if (event.params.from.notEqual(Address.zero())) {
    let from = loadHolder(token, event.params.from);
    let had = from.balance.gt(BigInt.zero());
    from.balance = from.balance.minus(event.params.value);
    from.updatedAt = event.block.timestamp;
    from.updatedAtBlock = event.block.number;
    from.save();
    if (had && from.balance.isZero() && event.params.from.notEqual(DEAD)) adjustHolderCount(token, -1);
  }

  if (event.params.to.notEqual(Address.zero())) {
    let to = loadHolder(token, event.params.to);
    let had = to.balance.gt(BigInt.zero());
    to.balance = to.balance.plus(event.params.value);
    to.updatedAt = event.block.timestamp;
    to.updatedAtBlock = event.block.number;
    to.save();
    // The burn address holds burned supply; it is not a holder.
    if (!had && to.balance.gt(BigInt.zero()) && event.params.to.notEqual(DEAD)) adjustHolderCount(token, 1);
  }

  if (event.params.to.equals(DEAD)) {
    let t = Token.load(token);
    if (t != null) {
      t.burnedSupply = t.burnedSupply.plus(event.params.value);
      t.save();
    }
  }
}

export function handleMetaURISet(event: MetaURISet): void {
  let t = Token.load(event.address);
  if (t == null) return;
  t.metaUri = event.params.uri;
  t.save();
}

export function handleRewardConfigSet(event: RewardConfigSet): void {
  let t = Token.load(event.address);
  if (t == null) return;
  t.rewardHook = event.params.hook;
  t.rewardCurrency = event.params.currency;
  t.save();
}

export function handleHolderRewardDeposited(event: HolderRewardDeposited): void {
  let d = new HolderRewardDeposit(eventId(event));
  d.token = event.address;
  d.amount = event.params.amount;
  d.blockNumber = event.block.number;
  d.timestamp = event.block.timestamp;
  d.txHash = event.transaction.hash;
  d.save();
}

function roundId(token: Address, roundStart: BigInt): string {
  return token.toHexString() + "-" + roundStart.toString();
}

export function handleDistributionRoundClosed(event: DistributionRoundClosed): void {
  let r = new HolderRewardRound(roundId(event.address, event.params.roundStart));
  r.token = event.address;
  r.roundStart = event.params.roundStart;
  r.pool = event.params.pool;
  r.eligibleCount = event.params.eligibleCount;
  r.totalWeight = event.params.totalWeight;
  r.finished = false;
  r.totalPaid = BigInt.zero();
  r.closedAtBlock = event.block.number;
  r.closedAtTimestamp = event.block.timestamp;
  r.closedAtTx = event.transaction.hash;
  r.save();

  let t = Token.load(event.address);
  if (t == null) return;
  t.activeRewardRound = r.id;
  t.save();
}

// Payouts are paid in batches between a round's close and finish, so they belong to the token's
// active round.
export function handleHolderRewardPaid(event: HolderRewardPaid): void {
  let p = new HolderRewardPayout(eventId(event));
  p.token = event.address;
  p.account = event.params.account;
  p.amount = event.params.amount;
  p.blockNumber = event.block.number;
  p.timestamp = event.block.timestamp;
  p.txHash = event.transaction.hash;

  let t = Token.load(event.address);
  if (t != null) {
    let active = t.activeRewardRound;
    if (active !== null) {
      let r = HolderRewardRound.load(active as string);
      if (r != null) {
        p.round = r.id;
        r.totalPaid = r.totalPaid.plus(event.params.amount);
        r.save();
      }
    }
  }
  p.save();
}

export function handleDistributionRoundFinished(event: DistributionRoundFinished): void {
  let r = HolderRewardRound.load(roundId(event.address, event.params.roundStart));
  if (r != null) {
    r.finished = true;
    r.finishedAtBlock = event.block.number;
    r.finishedAtTimestamp = event.block.timestamp;
    r.finishedAtTx = event.transaction.hash;
    r.save();
  }
  let t = Token.load(event.address);
  if (t == null) return;
  t.activeRewardRound = null;
  t.save();
}
'''),

'duck-vault': (r'''import { Vault, VaultDeposit, VaultBorrow, VaultRepayment, VaultCollateralChange, VaultLiquidation, VaultBadDebt, VaultBuybackQueued, VaultBuybackExecuted, VaultWithdrawal } from "../generated/schema";
import { eventId } from "./admin";
''', r'''
export function handleDeposited(event: Deposited): void {
  let d = new VaultDeposit(eventId(event));
  d.vault = event.address;
  d.from = event.params.from;
  d.amount = event.params.amount;
  d.blockNumber = event.block.number;
  d.timestamp = event.block.timestamp;
  d.txHash = event.transaction.hash;
  d.save();
}

export function handleBorrowed(event: Borrowed): void {
  let b = new VaultBorrow(eventId(event));
  b.vault = event.address;
  b.borrower = event.params.borrower;
  b.amount = event.params.amount;
  b.newDebt = event.params.newDebt;
  b.blockNumber = event.block.number;
  b.timestamp = event.block.timestamp;
  b.txHash = event.transaction.hash;
  b.save();
}

export function handleRepaid(event: Repaid): void {
  let r = new VaultRepayment(eventId(event));
  r.vault = event.address;
  r.borrower = event.params.borrower;
  r.amount = event.params.amount;
  r.remainingDebt = event.params.remainingDebt;
  r.blockNumber = event.block.number;
  r.timestamp = event.block.timestamp;
  r.txHash = event.transaction.hash;
  r.save();
}

export function handleCollateralAdded(event: CollateralAdded): void {
  let c = new VaultCollateralChange(eventId(event));
  c.vault = event.address;
  c.borrower = event.params.borrower;
  c.isAdd = true;
  c.amount = event.params.amount;
  c.blockNumber = event.block.number;
  c.timestamp = event.block.timestamp;
  c.txHash = event.transaction.hash;
  c.save();
}

export function handleCollateralWithdrawn(event: CollateralWithdrawn): void {
  let c = new VaultCollateralChange(eventId(event));
  c.vault = event.address;
  c.borrower = event.params.borrower;
  c.isAdd = false;
  c.amount = event.params.amount;
  c.blockNumber = event.block.number;
  c.timestamp = event.block.timestamp;
  c.txHash = event.transaction.hash;
  c.save();
}

export function handleLiquidated(event: Liquidated): void {
  let l = new VaultLiquidation(eventId(event));
  l.vault = event.address;
  l.borrower = event.params.borrower;
  l.liquidator = event.params.liquidator;
  l.repaid = event.params.repaid;
  l.seized = event.params.seized;
  l.blockNumber = event.block.number;
  l.timestamp = event.block.timestamp;
  l.txHash = event.transaction.hash;
  l.save();
}

export function handleBadDebtRealized(event: BadDebtRealized): void {
  let b = new VaultBadDebt(eventId(event));
  b.vault = event.address;
  b.borrower = event.params.borrower;
  b.amount = event.params.amount;
  b.blockNumber = event.block.number;
  b.timestamp = event.block.timestamp;
  b.txHash = event.transaction.hash;
  b.save();
}

export function handleWithdrawn(event: Withdrawn): void {
  let w = new VaultWithdrawal(eventId(event));
  w.vault = event.address;
  w.to = event.params.to;
  w.amount = event.params.amount;
  w.blockNumber = event.block.number;
  w.timestamp = event.block.timestamp;
  w.txHash = event.transaction.hash;
  w.save();
}

export function handleBuybackQueued(event: BuybackQueued): void {
  let b = new VaultBuybackQueued(eventId(event));
  b.vault = event.address;
  b.amount = event.params.amount;
  b.blockNumber = event.block.number;
  b.timestamp = event.block.timestamp;
  b.txHash = event.transaction.hash;
  b.save();
}

export function handleBuybackExecuted(event: BuybackExecuted): void {
  let b = new VaultBuybackExecuted(eventId(event));
  b.vault = event.address;
  b.currencyIn = event.params.currencyIn;
  b.tokensBurned = event.params.tokensBurned;
  b.blockNumber = event.block.number;
  b.timestamp = event.block.timestamp;
  b.txHash = event.transaction.hash;
  b.save();
}

export function handleEnabled(event: Enabled): void {
  let v = Vault.load(event.address);
  if (v == null) return;
  v.enabled = event.params.enabled;
  v.save();
}

export function handlePoolLinked(event: PoolLinked): void {
  let v = Vault.load(event.address);
  if (v == null) return;
  v.currency = event.params.currency;
  v.poolId = event.params.poolId;
  v.save();
}

export function handleGovernorSet(event: GovernorSet): void {
  let v = Vault.load(event.address);
  if (v != null) {
    v.governor = event.params.governor;
    v.save();
  }
  logAdminEvent(event, CONTRACT, "GovernorSet", event.params.governor.toHexString());
}

export function handleCreatorSet(event: CreatorSet): void {
  let v = Vault.load(event.address);
  if (v != null) {
    v.creator = event.params.creator;
    v.save();
  }
  logAdminEvent(event, CONTRACT, "CreatorSet", event.params.creator.toHexString());
}
'''),

'duck-token-governor': (r'''import { Bytes } from "@graphprotocol/graph-ts";
import { Proposal, Vote } from "../generated/schema";
import { eventId } from "./admin";
''', r'''
function proposalEntityId(governor: string, proposalId: string): string {
  return governor + "-" + proposalId;
}

export function handleProposalCreated(event: ProposalCreated): void {
  let p = new Proposal(proposalEntityId(event.address.toHexString(), event.params.proposalId.toString()));
  p.governor = event.address;
  p.proposalId = event.params.proposalId;
  p.proposer = event.params.proposer;
  p.targets = event.params.targets.map<Bytes>((a) => a as Bytes);
  p.values = event.params.values;
  p.signatures = event.params.signatures;
  p.calldatas = event.params.calldatas;
  p.voteStart = event.params.voteStart;
  p.voteEnd = event.params.voteEnd;
  p.description = event.params.description;
  p.canceled = false;
  p.queued = false;
  p.executed = false;
  p.createdAtBlock = event.block.number;
  p.createdAtTimestamp = event.block.timestamp;
  p.createdAtTx = event.transaction.hash;
  p.save();
}

export function handleProposalCanceled(event: ProposalCanceled): void {
  let p = Proposal.load(proposalEntityId(event.address.toHexString(), event.params.proposalId.toString()));
  if (p == null) return;
  p.canceled = true;
  p.save();
}

export function handleProposalQueued(event: ProposalQueued): void {
  let p = Proposal.load(proposalEntityId(event.address.toHexString(), event.params.proposalId.toString()));
  if (p == null) return;
  p.queued = true;
  p.etaSeconds = event.params.etaSeconds;
  p.save();
}

export function handleProposalExecuted(event: ProposalExecuted): void {
  let p = Proposal.load(proposalEntityId(event.address.toHexString(), event.params.proposalId.toString()));
  if (p == null) return;
  p.executed = true;
  p.save();
}

export function handleVoteCast(event: VoteCast): void {
  let v = new Vote(eventId(event));
  v.governor = event.address;
  v.proposal = proposalEntityId(event.address.toHexString(), event.params.proposalId.toString());
  v.voter = event.params.voter;
  v.support = event.params.support;
  v.weight = event.params.weight;
  v.reason = event.params.reason;
  v.blockNumber = event.block.number;
  v.timestamp = event.block.timestamp;
  v.txHash = event.transaction.hash;
  v.save();
}

export function handleVoteCastWithParams(event: VoteCastWithParams): void {
  let v = new Vote(eventId(event));
  v.governor = event.address;
  v.proposal = proposalEntityId(event.address.toHexString(), event.params.proposalId.toString());
  v.voter = event.params.voter;
  v.support = event.params.support;
  v.weight = event.params.weight;
  v.reason = event.params.reason;
  v.params = event.params.params;
  v.blockNumber = event.block.number;
  v.timestamp = event.block.timestamp;
  v.txHash = event.transaction.hash;
  v.save();
}
'''),

'timelock-controller': (r'''import { TimelockOperation } from "../generated/schema";
''', r'''
function operationEntityId(timelock: string, operationId: string, index: string): string {
  return timelock + "-" + operationId + "-" + index;
}

export function handleCallScheduled(event: CallScheduled): void {
  let op = new TimelockOperation(operationEntityId(event.address.toHexString(), event.params.id.toHexString(), event.params.index.toString()));
  op.timelock = event.address;
  op.operationId = event.params.id;
  op.index = event.params.index;
  op.target = event.params.target;
  op.value = event.params.value;
  op.data = event.params.data;
  op.predecessor = event.params.predecessor;
  op.delay = event.params.delay;
  op.executed = false;
  op.cancelled = false;
  op.scheduledAtBlock = event.block.number;
  op.scheduledAtTimestamp = event.block.timestamp;
  op.scheduledAtTx = event.transaction.hash;
  op.save();
}

export function handleCallExecuted(event: CallExecuted): void {
  let op = TimelockOperation.load(operationEntityId(event.address.toHexString(), event.params.id.toHexString(), event.params.index.toString()));
  if (op == null) return;
  op.executed = true;
  op.executedAtBlock = event.block.number;
  op.executedAtTimestamp = event.block.timestamp;
  op.executedAtTx = event.transaction.hash;
  op.save();
}

// Cancelled carries only the operation id. DuckTokenGovernor schedules single-call operations, so the
// call to mark is index 0.
export function handleCancelled(event: Cancelled): void {
  let op = TimelockOperation.load(operationEntityId(event.address.toHexString(), event.params.id.toHexString(), "0"));
  if (op != null) {
    op.cancelled = true;
    op.save();
  }
  logAdminEvent(event, CONTRACT, "Cancelled", event.params.id.toHexString());
}
'''),
}

# ---------------------------------------------------------------- generation
def abi_type(i):
    if i['type'].startswith('tuple'):
        return '(' + ','.join(abi_type(c) for c in i['components']) + ')' + i['type'][5:]
    return i['type']

def load_abis():
    abis = {n: json.load(open(f'{OUT}/{n}.sol/{n}.json'))['abi'] for n in CONTRACT_ABIS}
    abis['PoolManager'] = json.load(open(OLD_POOLMANAGER_ABI))
    abis['ERC20'] = ERC20_ABI
    abis['UniswapV3Pool'] = UNISWAP_V3_POOL_ABI
    abis['UniswapV3Factory'] = UNISWAP_V3_FACTORY_ABI
    abis['V4StateReader'] = V4_STATE_READER_ABI
    return abis

def events_of(abis, abi_name, source_name):
    evs = [e for e in abis[abi_name] if e.get('type') == 'event']
    only = ONLY_EVENTS.get(source_name)
    return [e for e in evs if only is None or e['name'] in only]

def stringify(p, idx):
    name = p['name'] or f'param{idx}'
    ref = f'event.params.{name}'
    t = p['type']
    if t.endswith(']'):         return f'{ref}.length.toString()'
    if t == 'address':          return f'{ref}.toHexString()'
    if t == 'bool':             return f'boolToString({ref})'
    if t == 'string':           return ref
    if t.startswith('bytes'):   return f'{ref}.toHexString()'
    return f'{ref}.toString()'

def admin_handler(e):
    parts = [stringify(p, i) for i, p in enumerate(e['inputs'])]
    if len(parts) > 4:
        parts = parts[:3] + [' + "|" + '.join(parts[3:])]
    args = ''.join(', ' + x for x in parts)
    return (f'\nexport function handle{e["name"]}(event: {e["name"]}): void {{\n'
            f'  logAdminEvent(event, CONTRACT, "{e["name"]}"{args});\n}}\n')

def build_mapping(abis, source, abi_name, file_, is_template):
    evs = events_of(abis, abi_name, source)
    imports, body = RICH[file_]
    rich = set(re.findall(r'export function (handle\w+)\(', body))
    valid = {'handle' + e['name'] for e in evs}
    unknown = rich - valid
    assert not unknown, f'{file_}: hand-written handlers with no matching event: {sorted(unknown)}'
    gen_path = f'../generated/templates/{source}/{abi_name}' if is_template else f'../generated/{source}/{abi_name}'
    event_names = sorted({e['name'] for e in evs})
    generated = ''.join(admin_handler(e) for e in evs if 'handle' + e['name'] not in rich)
    out = f'// {source} event handlers. Generated by gen_subgraphs.py; edit the generator, not this file.\n'
    out += 'import {\n' + ''.join(f'  {n},\n' for n in event_names) + f'}} from "{gen_path}";\n'
    out += imports
    out += 'import { logAdminEvent, boolToString } from "./admin";\n\n'
    out += f'const CONTRACT = "{source}";\n'
    out += body
    if generated:
        out += '\n// ---- config and admin events, recorded as AdminEvent ----\n' + generated
    return out, len(evs), len(rich)

def price_config():
    out = ['// USD price reference config for every network. Generated by gen_subgraphs.py.',
           'export const KIND_ETH_STABLE: i32 = 0;', 'export const KIND_TOKEN_ETH: i32 = 1;', 'export const KIND_TOKEN_STABLE: i32 = 2;', '',
           'export class RefPool {', '  pool: string;', '  token: string;', '  kind: i32;', '  pricedIsToken0: boolean;', '  dec0: i32;', '  dec1: i32;', '  discovered: boolean = false;',
           '  constructor(pool: string, token: string, kind: i32, pricedIsToken0: boolean, dec0: i32, dec1: i32) {',
           '    this.pool = pool;', '    this.token = token;', '    this.kind = kind;', '    this.pricedIsToken0 = pricedIsToken0;', '    this.dec0 = dec0;', '    this.dec1 = dec1;', '  }', '}', '',
           'export class V4RefPool {', '  poolId: string;', '  token: string;', '  tokenDecimals: i32;', '  discovered: boolean = false;',
           '  constructor(poolId: string, token: string, tokenDecimals: i32) {',
           '    this.poolId = poolId;', '    this.token = token;', '    this.tokenDecimals = tokenDecimals;', '  }', '}', '']
    kinds = {'ETH_STABLE': 'KIND_ETH_STABLE', 'TOKEN_ETH': 'KIND_TOKEN_ETH', 'TOKEN_STABLE': 'KIND_TOKEN_STABLE'}
    nets = sorted({r['network'] for r in REF_POOLS})
    out.append('export function refPools(network: string): RefPool[] {')
    for n in nets:
        rows = [r for r in REF_POOLS if r['network'] == n and r['kind'] != 'TOKEN_ETH_V4']
        out.append(f'  if (network == "{n}") return [')
        out += [f'    new RefPool("{r["pool"]}", "{r["token"]}", {kinds[r["kind"]]}, {str(r["pricedIsToken0"]).lower()}, {r["dec0"]}, {r["dec1"]}), // {r["symbol"]}' for r in rows]
        out.append('  ];')
    out += ['  return new Array<RefPool>(0);', '}', '', 'export function v4RefPools(network: string): V4RefPool[] {']
    for n in nets:
        rows = [r for r in REF_POOLS if r['network'] == n and r['kind'] == 'TOKEN_ETH_V4']
        if rows:
            out.append(f'  if (network == "{n}") return [')
            out += [f'    new V4RefPool("{r["poolId"]}", "{r["token"]}", {r["tokenDecimals"]}), // {r["symbol"]}' for r in rows]
            out.append('  ];')
    out += ['  return new Array<V4RefPool>(0);', '}', '', 'export function stableTokens(network: string): string[] {']
    for n, toks in STABLES.items():
        out.append(f'  if (network == "{n}") return [' + ', '.join(f'"{t}"' for t in toks) + '];')
    out += ['  return new Array<string>(0);', '}', '', 'export function wrappedNative(network: string): string {']
    for n, t in WRAPPED_NATIVE.items():
        out.append(f'  if (network == "{n}") return "{t}";')
    out += ['  return "";', '}', '', 'export function v3Factory(network: string): string {']
    for n, t in V3_FACTORY.items():
        out.append(f'  if (network == "{n}") return "{t}";')
    out += ['  return "";', '}', '', 'export function v4PoolManager(network: string): string {']
    for n, t in V4_POOL_MANAGER.items():
        out.append(f'  if (network == "{n}") return "{t}";')
    out += ['  return "";', '}', '']
    return '\n'.join(out)

def manifest(abis, cfg):
    y = ['specVersion: 1.2.0', f'description: DuckProtocol on {cfg["chainName"]}', 'schema:', '  file: ./schema.graphql', 'dataSources:']
    templates = []
    for source, abi_name, file_, is_template, extra, entities in SOURCES:
        b = [f'  - kind: ethereum', f'    name: {source}', f'    network: {cfg["network"]}', '    source:']
        if not is_template:
            addr = cfg['hook'] if source == 'DuckHookV4' else cfg['poolManager'] if source == 'PoolManager' else COMMON[source]
            b += [f'      address: "{addr}"']
        b += [f'      abi: {abi_name}']
        if not is_template:
            b += [f'      startBlock: {cfg["startBlock"]}']
        b += ['    mapping:', '      kind: ethereum/events', '      apiVersion: 0.0.9', '      language: wasm/assemblyscript', '      entities:']
        b += [f'        - {e}' for e in entities]
        b += ['      abis:'] + [f'        - name: {a}\n          file: ./abis/{a}.json' for a in [abi_name] + extra]
        b += ['      eventHandlers:']
        for e in events_of(abis, abi_name, source):
            sig = e['name'] + '(' + ','.join(('indexed ' if p['indexed'] else '') + abi_type(p) for p in e['inputs']) + ')'
            b += [f'        - event: {sig}', f'          handler: handle{e["name"]}']
        b += [f'      file: ./src/{file_}.ts']
        (templates if is_template else y).append('\n'.join(b))
    v3refs = [r for r in REF_POOLS if r['network'] == cfg['network'] and r['kind'] != 'TOKEN_ETH_V4']
    for i, r in enumerate(v3refs):
        y.append('\n'.join([
            f'  - kind: ethereum', f'    name: PriceReference{i} # {r["symbol"]} ({r["kind"]})', f'    network: {cfg["network"]}',
            '    source:', f'      address: "{r["pool"]}"', '      abi: UniswapV3Pool', f'      startBlock: {cfg["startBlock"] - REF_START_OFFSET}',
            '    mapping:', '      kind: ethereum/events', '      apiVersion: 0.0.9', '      language: wasm/assemblyscript',
            '      entities:', '        - QuotePrice', '        - EthReferencePool', '        - DiscoveredReferencePool',
            '      abis:', '        - name: UniswapV3Pool', '          file: ./abis/UniswapV3Pool.json',
            '      eventHandlers:', '        - event: Swap(indexed address,indexed address,int256,int256,uint160,uint128,int24)', '          handler: handleSwap',
            '      file: ./src/ref-pool.ts']))
    templates.append(chr(10).join([
        '  - kind: ethereum', '    name: DiscoveredV3Pool', f'    network: {cfg["network"]}', '    source:', '      abi: UniswapV3Pool',
        '    mapping:', '      kind: ethereum/events', '      apiVersion: 0.0.9', '      language: wasm/assemblyscript',
        '      entities:', '        - QuotePrice', '        - DiscoveredReferencePool',
        '      abis:', '        - name: UniswapV3Pool', '          file: ./abis/UniswapV3Pool.json',
        '      eventHandlers:', '        - event: Swap(indexed address,indexed address,int256,int256,uint160,uint128,int24)', '          handler: handleSwap',
        '      file: ./src/ref-pool.ts']))
    return '\n'.join(y) + '\n\ntemplates:\n' + '\n\n'.join(templates) + '\n'

def readme(folder, cfg):
    return f'''# {folder}

Subgraph for DuckProtocol on {cfg["chainName"]}, deployed to Goldsky as `{cfg["slug"]}`.

Indexes every event of every DuckProtocol contract on this chain: the bonding curve, launcher and
crowdfund, the v4 hook and the PoolManager swaps in its pools, lending vaults and their
factory/config, per-token governance, and each token's transfers and holder rewards.

## Contracts

| Data source | Address |
|---|---|
| DuckBondingCurve | `{COMMON["DuckBondingCurve"]}` |
| DuckLauncher | `{COMMON["DuckLauncher"]}` |
| DuckCrowdfund | `{COMMON["DuckCrowdfund"]}` |
| DuckHookV4 | `{cfg["hook"]}` |
| PoolManager (Uniswap v4) | `{cfg["poolManager"]}` |
| DuckVaultFactory | `{COMMON["DuckVaultFactory"]}` |
| DuckVaultConfig | `{COMMON["DuckVaultConfig"]}` |
| DuckTokenGovernorFactory | `{COMMON["DuckTokenGovernorFactory"]}` |

All start at block {cfg["startBlock"]}. `DuckToken`, `DuckVault`, `DuckTokenGovernor` and
`TimelockControllerUpgradeable` are templates, created as tokens, vaults and governors appear.

## Entities

Product activity gets typed entities: `Token`, `Holder`, `Trade` (bonding curve), `PoolSwap` (v4
pool), `TokenHourData`, `Migration`, `Launch`, `Campaign` with its contributions/claims/refunds,
`PoolRegistration`, `HookFeeClaim`, `CTOEvent`, `HookBuybackBurn`, holder rewards
(`HolderRewardRound`, `HolderRewardDeposit`, `HolderRewardPayout`), vault lifecycle entities, and
governance (`Governor`, `Timelock`, `Proposal`, `Vote`, `TimelockOperation`). Every remaining
config or admin event is stored as an `AdminEvent`, queryable by contract and event name.

## USD pricing

Prices are recorded both in quote units per token and in USD. Stablecoins ({{stables}}) count as
exactly $1. ETH/USD comes from {{eth}}. Every other curated quote token is priced from its deepest
reference pool, against ETH or a stablecoin; `QuotePrice` holds the latest reference price and
`EthReferencePool` the per-pool ETH prices.

Trades and pool swaps store `priceUSD` and `volumeUSD` at trade time, and tokens carry
`lastPriceUSD`, `marketCapUSD` and `volumeUSDAllTime`. A quote token with no curated reference (for
example an arbitrary token picked in the launcher) gets one discovered automatically: its deepest
Uniswap v3 pool against WETH or a $1 stablecoin, or v4 pool against native ETH, looked up when the
token is first used and retried at most every 6 hours while none exists. Discovered prices have no
minimum depth and are marked `origin: DISCOVERED` with the pool's depth, because a thin pool can show a
misleading USD value. Reference
prices move only when their pool trades and can be pushed by a large swap, so they are for display,
not for anything that settles value.

## Build and deploy

```
npm install
npm run codegen
npm run build
npm run deploy     # new Goldsky version, tagged "current"
```

This folder is generated, together with its sibling, by `../gen_subgraphs.py`; change the
generator and rerun it rather than editing one folder, so both chains stay identical.
'''

DEPLOY = r'''#!/usr/bin/env bash
# Deploys a new, uniquely versioned subgraph to Goldsky and moves the "current" tag to it, so
# consumers using the /current/ endpoint never need a URL change.
set -euo pipefail
cd "$(dirname "$0")"

NAME=__SLUG__
VERSION=$(date +%Y.%m.%d%H%M%S)

npx graph codegen
npx graph build
goldsky subgraph deploy "${NAME}/${VERSION}" --path .
goldsky subgraph tag create "${NAME}/${VERSION}" --tag current
echo "Deployed ${NAME}/${VERSION} and tagged it current"
'''

def main():
    abis = load_abis()
    for folder, cfg in CHAINS.items():
        root = f'{DEST}/{folder}'
        if os.path.exists(root) and os.listdir(root) and '--force' not in sys.argv:
            sys.exit(f'{root} exists and is not empty; pass --force to overwrite generated files')
        os.makedirs(f'{root}/src', exist_ok=True)
        os.makedirs(f'{root}/abis', exist_ok=True)
        for name, abi in abis.items():
            json.dump(abi, open(f'{root}/abis/{name}.json', 'w'), indent=2)
        open(f'{root}/schema.graphql', 'w').write(SCHEMA)
        for fname, text in HELPERS.items():
            open(f'{root}/src/{fname}', 'w').write(text)
        open(f'{root}/src/price-config.ts', 'w').write(price_config())
        total_events = total_rich = 0
        for source, abi_name, file_, is_template, extra, entities in SOURCES:
            text, n_ev, n_rich = build_mapping(abis, source, abi_name, file_, is_template)
            open(f'{root}/src/{file_}.ts', 'w').write(text)
            total_events += n_ev; total_rich += n_rich
        open(f'{root}/subgraph.yaml', 'w').write(manifest(abis, cfg))
        open(f'{root}/deploy.sh', 'w').write(DEPLOY.replace('__SLUG__', cfg['slug']))
        os.chmod(f'{root}/deploy.sh', 0o755)
        pkg = {"name": cfg['slug'], "version": "1.0.0", "private": True,
               "scripts": {"codegen": "graph codegen", "build": "graph build", "deploy": "bash deploy.sh"},
               "dependencies": {"@graphprotocol/graph-cli": "^0.98.1", "@graphprotocol/graph-ts": "^0.38.1"}}
        open(f'{root}/package.json', 'w').write(json.dumps(pkg, indent=2) + '\n')
        open(f'{root}/.gitignore', 'w').write('node_modules/\ngenerated/\nbuild/\n')
        open(f'{root}/README.md', 'w').write(readme(folder, cfg).replace('{stables}', STABLE_NAMES[cfg['network']]).replace('{eth}', ETH_SOURCE[cfg['network']]))
        print(f'{folder}: {total_events} events indexed, {total_rich} with dedicated handlers, rest recorded as AdminEvent')

if __name__ == '__main__':
    main()
