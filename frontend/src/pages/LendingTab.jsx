import { useState } from "react";
import { parseUnits } from "viem";
import { cs } from "../cs.js";
import { compactNumber } from "../adapters.js";


// This token's own lending vault -- one per token, cloned at creation time
// (see lending/DuckVaultFactory.sol) and funded entirely by a creator-
// directed cut of this token's own fee revenue. Lives as a TokenPage tab
// rather than a separate page/market-list, matching the real 1:1
// token<->vault relationship (there is no cross-token "markets" concept to
// browse).
export default function LendingTab({ v }) {
  const mkt = v.vaultDetail;
  const [amount, setAmount] = useState("");
  const [tab, setTab] = useState("borrow");

  if (v.vaultsLoading || !mkt) {
    return <div style={cs("padding:24px;font-size:13px;color:var(--mute)")}>{v.vaultsLoading ? "Loading vault…" : "Open this tab to load real on-chain vault data."}</div>;
  }

  const dec = mkt.currencyDecimals || 18;
  const reserves = Number(mkt.totalReserves) / 10 ** dec;
  const borrows = Number(mkt.totalBorrows) / 10 ** dec;
  const cfg = v.vaultConfigData;

  const facts = [
    { k: "TOTAL RESERVES", v: mkt.currencySymbol ? compactNumber(reserves) + " " + mkt.currencySymbol : "—" },
    { k: "TOTAL BORROWED", v: mkt.currencySymbol ? compactNumber(borrows) + " " + mkt.currencySymbol : "—" },
    { k: "UTILIZATION", v: mkt.enabled ? (mkt.utilizationBps / 100).toFixed(1) + "%" : "—" },
    { k: "CREATOR / VAULT / BURN", v: mkt.vaultBps != null ? `${mkt.creatorBps / 100}% / ${mkt.vaultBps / 100}% / ${mkt.burnBps / 100}%` : "—" },
  ];

  const riskFacts = cfg ? [
    { k: "MAX LTV", v: (cfg.maxLtvBps / 100).toFixed(0) + "%" },
    { k: "LIQUIDATION THRESHOLD", v: (cfg.liquidationThresholdBps / 100).toFixed(0) + "%" },
    { k: "LIQUIDATION BONUS", v: (cfg.liquidationBonusBps / 100).toFixed(1) + "%" },
    { k: "CLOSE FACTOR", v: (cfg.closeFactorBps / 100).toFixed(0) + "%" },
  ] : [];

  function submit() {
    const num = Number(amount);
    if (!amount || !(num > 0)) return v.flash("Enter an amount.");
    if (tab === "borrow") {
      return v.borrowVault(mkt.vault, parseUnits(amount, dec), mkt.token.id);
    }
    if (tab === "repay") {
      return v.repayVaultLoan(mkt.vault, mkt.currency, parseUnits(amount, dec), mkt.token.id);
    }
    const tokenAmount = parseUnits(amount, 18); // the launched token itself is always 18 decimals
    if (tab === "add collateral") return v.addCollateral(mkt.vault, mkt.token.id, tokenAmount, mkt.token.id);
    return v.withdrawCollateral(mkt.vault, tokenAmount, mkt.token.id);
  }

  // Single column, not a content+sidebar split -- this tab is already
  // nested inside TokenPage's own main column (itself narrowed by the
  // sticky trade panel on desktop), so a second side-by-side split here
  // starves the open-positions table of the width its columns need and
  // clips the health column instead of scrolling it into view.
  return (
    <div>
      {!mkt.enabled && (
        <div style={cs("margin:16px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--mute);padding:12px 14px;font-size:12.5px;line-height:1.55")}>
          This token hasn't migrated to a real pool yet, so there's no live TWAP price to safely value collateral against. The vault exists (created at token creation) but stays disabled until migration links it to a real pool.
        </div>
      )}
      <div style={cs("display:flex;flex-wrap:wrap;border-bottom:1px solid var(--line)")}>
        {facts.map((f, i) => (
          <div key={i} style={cs("flex:1;min-width:150px;padding:13px 16px;border-right:1px solid var(--line)")}>
            <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>{f.k}</div>
            <div style={cs("font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:500;margin-top:5px")}>{f.v}</div>
          </div>
        ))}
      </div>

      {riskFacts.length > 0 && (
        <div style={cs("border-bottom:1px solid var(--line)")}>
          <div style={cs("padding:13px 16px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute)")}>RISK PARAMETERS · shared across every market</div>
          <div style={cs("display:flex;flex-wrap:wrap")}>
            {riskFacts.map((f, i) => (
              <div key={i} style={cs("flex:1;min-width:150px;padding:13px 16px;border-right:1px solid var(--line)")}>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>{f.k}</div>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:500;margin-top:5px")}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={cs("padding:16px;border-bottom:1px solid var(--line)")}>
        <div style={cs("display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:14px;max-width:420px;flex-wrap:wrap")}>
          {["borrow", "repay", "add collateral", "withdraw"].map((t) => (
            <button key={t} onClick={() => { setTab(t); setAmount(""); }} style={cs(`flex:1;min-width:90px;padding:10px 6px;border:0;background:${tab === t ? "var(--paper)" : "transparent"};font-size:11.5px;font-weight:700;text-transform:capitalize;cursor:pointer;color:var(--ink)`)}>{t}</button>
          ))}
        </div>
        <div style={cs("display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;max-width:420px")}>
          <label style={cs("flex:1;min-width:180px;display:flex;flex-direction:column;gap:8px")}>
            <span style={cs("font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;color:var(--mute)")}>
              {tab === "add collateral" || tab === "withdraw" ? `AMOUNT (${mkt.token.symbol})` : `AMOUNT (${mkt.currencySymbol || "—"})`}
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.0"
              disabled={!mkt.enabled || !v.connected}
              style={cs("width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:15px")}
            />
          </label>
          <button
            disabled={!mkt.enabled || !v.connected}
            onClick={submit}
            style={cs(`padding:13px 22px;border:1px solid var(--line);border-radius:8px;cursor:${mkt.enabled ? "pointer" : "not-allowed"};font-size:13.5px;font-weight:700;background:${mkt.enabled ? "var(--lime)" : "var(--paper)"};color:${mkt.enabled ? "var(--on)" : "var(--mute)"};text-transform:capitalize`)}
          >
            {tab}
          </button>
        </div>
        {!v.connected && <div style={cs("font-size:11.5px;color:var(--mute);margin-top:10px")}>Connect a wallet to borrow against your holdings.</div>}
      </div>

      <div>
        <div style={cs("padding:13px 18px;border-bottom:1px solid var(--line);display:flex;align-items:baseline;gap:12px;flex-wrap:wrap")}>
          <span style={cs("font-size:15px;font-weight:700;letter-spacing:-.02em")}>Open positions</span>
          <span style={cs("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute)")}>{mkt.loans?.length || 0} borrower{mkt.loans?.length === 1 ? "" : "s"}</span>
        </div>
        {(!mkt.loans || mkt.loans.length === 0) && <div style={cs("padding:24px 18px;font-size:13px;color:var(--mute)")}>No open positions.</div>}
        {mkt.loans?.length > 0 && (
          <div style={cs("overflow-x:auto")}>
            <div style={cs("display:grid;min-width:460px;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:14px;padding:10px 18px;border-bottom:1px solid var(--line);background:var(--paper);font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.14em;color:var(--mute)")}>
              <span>BORROWER</span><span style={cs("text-align:right")}>COLLATERAL</span><span style={cs("text-align:right")}>DEBT</span><span style={cs("text-align:right")}>HEALTH</span>
            </div>
            {mkt.loans.map((loan, i) => {
              const health = loan.healthFactorBps / 10000;
              const healthColor = health >= 0.8 ? "var(--pos)" : health >= 0.65 ? "var(--mute)" : "var(--neg)";
              return (
                <div key={i} style={cs("display:grid;min-width:460px;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:14px;padding:11px 18px;border-bottom:1px solid var(--soft);font-family:'JetBrains Mono',monospace;font-size:12.5px;align-items:center")}>
                  <span>{v.shortAddress(loan.borrower)}</span>
                  <span style={cs("text-align:right")}>{compactNumber(Number(loan.collateral) / 1e18)} {mkt.token.symbol}</span>
                  <span style={cs("text-align:right")}>{compactNumber(Number(loan.debt) / 10 ** dec)} {mkt.currencySymbol}</span>
                  <span style={cs(`text-align:right;color:${healthColor};font-weight:600`)}>{(health * 100).toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
