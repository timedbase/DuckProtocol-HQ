import { createPublicClient, http, defineChain } from "viem";
import { createConfig } from "wagmi";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet, rainbowWallet, zerionWallet, coinbaseWallet, walletConnectWallet, rabbyWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { getWalletClient as wagmiGetWalletClient } from "wagmi/actions";
import { CHAINS, CHAIN_LIST, DEFAULT_CHAIN_SLUG } from "./addresses.js";

// Without a `contracts.multicall3` entry viem throws on every publicClient.multicall(...). The
// canonical deployment exists on both chains.
const MULTICALL3 = { address: "0xcA11bde05977b3631167028862bE2a173976CA11" };

function toViemChain(c) {
  return defineChain({
    id: c.chainId,
    name: c.name,
    nativeCurrency: { name: "Ether", symbol: c.nativeSymbol, decimals: c.nativeDecimals },
    rpcUrls: { default: { http: [c.rpcUrl] } },
    blockExplorers: { default: { name: `${c.name} Explorer`, url: c.blockExplorerUrl } },
    contracts: { multicall3: MULTICALL3 },
  });
}

export const VIEM_CHAINS = Object.fromEntries(CHAIN_LIST.map((c) => [c.slug, toViemChain(c)]));

// Reads always go through the chain's public RPC (works with no wallet connected). One memoized
// client per chain; `chain` is the resolved CHAINS[slug] config every caller threads through.
const publicClients = new Map();
export function getPublicClient(chain = CHAINS[DEFAULT_CHAIN_SLUG]) {
  const cached = publicClients.get(chain.slug);
  if (cached) return cached;
  const client = createPublicClient({ chain: VIEM_CHAINS[chain.slug], transport: http(chain.rpcUrl) });
  publicClients.set(chain.slug, client);
  return client;
}

// An explicit wallet list rather than getDefaultConfig's curated set, so Zerion and Rabby are always
// offered; EIP-6963 discovery still surfaces any other installed wallet. WalletConnect needs a
// project id (VITE_WALLETCONNECT_PROJECT_ID); injected wallets work without one.
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [metaMaskWallet, rainbowWallet, zerionWallet, rabbyWallet, coinbaseWallet, walletConnectWallet],
    },
  ],
  { appName: "Duck Protocol", projectId: walletConnectProjectId }
);

export const config = createConfig({
  connectors,
  chains: CHAIN_LIST.map((c) => VIEM_CHAINS[c.slug]),
  transports: Object.fromEntries(CHAIN_LIST.map((c) => [c.chainId, http(c.rpcUrl)])),
});

// Writes go through whichever wallet the user connected; callers switch it to the target chain
// first (see App.jsx's runTx guard).
export async function getWalletClient() {
  return wagmiGetWalletClient(config);
}
