import "dotenv/config";
import { createPublicClient, createWalletClient, http, defineChain, type Address, type PublicClient, type WalletClient, type Chain, type Account } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const GOLDSKY = "https://api.goldsky.com/api/public/project_cmhtxnzpqm81001w94ksmgira/subgraphs";

type ChainDef = { slug: string; chainId: number; name: string; rpcEnv: string; defaultRpc: string; subgraphEnv: string; defaultSubgraph: string };

// Same deployment and subgraphs the backend serves (see backend/src/chain/addresses.ts).
const CHAIN_DEFS: ChainDef[] = [
  {
    slug: "robinhood", chainId: 4663, name: "Robinhood Chain",
    rpcEnv: "ROBINHOOD_RPC_URL", defaultRpc: "https://rpc.mainnet.chain.robinhood.com",
    subgraphEnv: "ROBINHOOD_SUBGRAPH_URL", defaultSubgraph: `${GOLDSKY}/duck-subgraph-rh/current/gn`,
  },
  {
    slug: "ink", chainId: 57073, name: "Ink",
    rpcEnv: "INK_RPC_URL", defaultRpc: "https://rpc-gel.inkonchain.com",
    subgraphEnv: "INK_SUBGRAPH_URL", defaultSubgraph: `${GOLDSKY}/duck-subgraph-ink/current/gn`,
  },
];

export const dryRun = process.env.DRY_RUN === "true";

// DuckKeeper's own operating wallet -- no special role in any contract, just gas on each chain. See
// .env.example for why this must never be the protocol owner/deployer key. Required in dry-run too so
// the logged address is the real one.
const account = privateKeyToAccount(requireEnv("KEEPER_PRIVATE_KEY") as `0x${string}`);
export const keeperAddress: Address = account.address;

export type KeeperChain = {
  slug: string;
  subgraphUrl: string;
  publicClient: PublicClient;
  walletClient: WalletClient<ReturnType<typeof http>, Chain, Account>;
};

// KEEPER_CHAINS (comma-separated slugs) limits a run to some chains; default is all of them.
const enabled = (process.env.KEEPER_CHAINS || CHAIN_DEFS.map((c) => c.slug).join(","))
  .split(",").map((s) => s.trim()).filter(Boolean);

export const chains: KeeperChain[] = CHAIN_DEFS.filter((c) => enabled.includes(c.slug)).map((c) => {
  const rpcUrl = process.env[c.rpcEnv] || c.defaultRpc;
  const chain = defineChain({
    id: c.chainId,
    name: c.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  return {
    slug: c.slug,
    subgraphUrl: process.env[c.subgraphEnv] || c.defaultSubgraph,
    publicClient: createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient,
    walletClient: createWalletClient({ account, chain, transport: http(rpcUrl) }),
  };
});
