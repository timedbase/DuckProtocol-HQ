import { createPublicClient, http, defineChain } from "viem";
import { createConfig } from "wagmi";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet, rainbowWallet, zerionWallet, coinbaseWallet, walletConnectWallet, rabbyWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { getWalletClient as wagmiGetWalletClient } from "wagmi/actions";
import { CHAIN } from "./addresses.js";

// Without a `contracts.multicall3` entry, viem has nowhere to send a
// multicall aggregate3 call and throws on every publicClient.multicall(...)
// -- used by fetchTokenMeta (name/symbol batching, loadCoins' hard
// dependency) and getPlatformTokens. Verified deployed at the standard
// canonical address via the deterministic deployment proxy.
const MULTICALL3 = { address: "0xcA11bde05977b3631167028862bE2a173976CA11" };

export const robinhood = defineChain({
  id: CHAIN.chainId,
  name: CHAIN.name,
  nativeCurrency: { name: "Ether", symbol: CHAIN.nativeSymbol, decimals: CHAIN.nativeDecimals },
  rpcUrls: { default: { http: [CHAIN.rpcUrl] } },
  blockExplorers: { default: { name: "Robinhood Chain Explorer", url: CHAIN.blockExplorerUrl } },
  contracts: { multicall3: MULTICALL3 },
});

// Reads always go through the public RPC (works with no wallet connected).
// Memoized -- single-chain, so this is just one cached client, kept as a
// function (not a bare export) so call sites don't need to change if a
// second chain is ever added.
let publicClientSingleton = null;
export function getPublicClient() {
  if (publicClientSingleton) return publicClientSingleton;
  publicClientSingleton = createPublicClient({ chain: robinhood, transport: http(CHAIN.rpcUrl) });
  return publicClientSingleton;
}

// An explicit wallet list (connectorsForWallets), not getDefaultConfig's
// curated set -- getDefaultConfig doesn't put Zerion in its own "Popular"
// row, so it only ever showed up if that extension happened to already be
// installed and self-announce via EIP-6963; pinning it here guarantees it's
// always offered (as a real connector, or a download link when not
// installed) the same way MetaMask/Coinbase/Rainbow already are.
// multiInjectedProviderDiscovery stays on its wagmi default (true), so any
// OTHER EIP-6963 wallet a visitor has installed (Rabby included, also
// pinned explicitly below, plus anything not listed at all) still shows up
// too -- this list only guarantees a few specific wallets' PLACEMENT, it
// doesn't turn off detection of everything else.
//
// WalletConnect specifically needs a WalletConnect Cloud project id --
// injected wallets (MetaMask, Rabby, Zerion's extension) work regardless.
// Get a free one at https://cloud.reown.com and set
// VITE_WALLETCONNECT_PROJECT_ID (see .env.example); a placeholder keeps the
// app mounting with no env configured, only the WalletConnect connector
// itself would fail if actually used with the placeholder still in place.
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
  chains: [robinhood],
  transports: { [robinhood.id]: http(CHAIN.rpcUrl) },
});

// Writes go through whichever wallet the user connected via RainbowKit --
// wagmi's non-hook action API, so this stays a plain async function callable
// from chain/tx.js instead of needing every caller to be a component.
export async function getWalletClient() {
  return wagmiGetWalletClient(config);
}
