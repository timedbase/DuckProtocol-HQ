import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import App from "./App.jsx";
import { config } from "./chain/client.js";
import "./styles.css";

const queryClient = new QueryClient();

// RainbowKit needs literal color values (its theme isn't rendered in a
// context that resolves our CSS custom properties), so these are pinned to
// the exact same hex the rest of the app reads via var(--lime)/var(--on) --
// kept in sync by hand. Previously these were stale pre-"DuckFun v2
// palette" values (#c8f169/#111110, a slightly different yellow-green and
// near-black that never got updated when styles.css's tokens changed),
// which made RainbowKit's own "Connect Wallet" modal show a visibly
// different accent color than every other lime element in the app.
const rkTheme = darkTheme({
  accentColor: "#a3e635", // var(--lime) / var(--pos)
  accentColorForeground: "#141c06", // var(--on) -- the readable text color on top of --lime
  borderRadius: "none",
  fontStack: "system",
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rkTheme}>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
