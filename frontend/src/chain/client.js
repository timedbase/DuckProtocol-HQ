import { createPublicClient, http, defineChain } from "viem";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
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

// RainbowKit's default connector set (injected, WalletConnect, Coinbase
// Wallet, and more) needs a WalletConnect Cloud project id for the
// WalletConnect connector specifically -- injected wallets (MetaMask, Rabby)
// work regardless. Get a free one at https://cloud.reown.com and set
// VITE_WALLETCONNECT_PROJECT_ID (see .env.example). getDefaultConfig throws
// synchronously (crashing the whole app before first render, not just
// disabling the WalletConnect option) on an empty projectId -- falls back to
// a placeholder so the app still mounts with no env configured; only the
// WalletConnect connector itself would fail if actually used with the
// placeholder still in place.
export const config = getDefaultConfig({
  appName: "Duck Protocol",
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000",
  chains: [robinhood],
  transports: { [robinhood.id]: http(CHAIN.rpcUrl) },
});

// Writes go through whichever wallet the user connected via RainbowKit --
// wagmi's non-hook action API, so this stays a plain async function callable
// from chain/tx.js instead of needing every caller to be a component.
export async function getWalletClient() {
  return wagmiGetWalletClient(config);
}
