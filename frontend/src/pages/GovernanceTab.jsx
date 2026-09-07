import { useState } from "react";
import { cs } from "../cs.js";
import { AddressChip, LinkChip } from "../MetaChips.jsx";
import { compactNumber } from "../adapters.js";

// Matches the backend's real OZ Governor state enum (governance.ts) --
// richer than a flat queued/executed/canceled flag set: Defeated/Succeeded/
// Expired are real, distinct terminal states a proposal can land in, not
// collapsed into a generic "Awaiting queue" bucket.
const STATUS_STYLE = {
  Pending: { bg: "var(--paper)", fg: "var(--mute)" },
  Active: { bg: "var(--lime)", fg: "var(--on)" },
  Defeated: { bg: "var(--paper)", fg: "var(--neg)" },
  Succeeded: { bg: "var(--paper)", fg: "var(--pos)" },
  Queued: { bg: "var(--card)", fg: "var(--ink)" },
  Expired: { bg: "var(--paper)", fg: "var(--mute)" },
  Executed: { bg: "var(--paper)", fg: "var(--pos)" },
  Canceled: { bg: "var(--paper)", fg: "var(--neg)" },
};

function QuorumBar({ label, pct, met }) {
  return (
    <div>
      <div style={cs("display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:11.5px;margin-bottom:6px")}>
        <span style={cs("color:var(--mute)")}>{label}</span>
        <span style={cs(`font-weight:600;color:${met ? "var(--pos)" : "var(--ink)"}`)}>{pct.toFixed(1)}% {met ? "· quorum met" : "· needs 40%"}</span>
      </div>
      <div style={cs("height:10px;border-radius:999px;background:var(--soft);overflow:hidden;position:relative")}>
        <div style={cs(`height:100%;background:${met ? "var(--pos)" : "var(--lime)"};width:${Math.min(100, pct)}%`)}></div>
        <div style={cs("position:absolute;top:0;bottom:0;width:1px;background:var(--ink);left:40%")}></div>
      </div>
    </div>
  );
}

function ProposalDetail({ v, p, onBack }) {
  const st = STATUS_STYLE[p.status] || STATUS_STYLE.Pending;
  // OZ Governor's fixed GovernorCountingSimple support values.
  const SUPPORT_CODE = { Against: 0, For: 1, Abstain: 2 };
  function vote(support) {
    v.voteOnProposal(p, SUPPORT_CODE[support]);
  }
  function execute() {
    v.executeGovernanceProposal(p);
  }
  const now = Math.floor(Date.now() / 1000);
  const canVote = p.status === "Active";
  const timelockRemaining = p.etaSeconds ? Number(p.etaSeconds) - now : null;

  return (
    <div>
      <button onClick={onBack} style={cs("border:0;background:transparent;font-family:'JetBrains Mono',monospace;font-size:11.5px;letter-spacing:.1em;color:var(--mute);cursor:pointer;padding:14px 18px 0")}>← ALL PROPOSALS</button>
      <div style={cs(`display:grid;grid-template-columns:${v.isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) 300px"};gap:16px;align-items:start;padding:16px 18px`)}>
        <div style={cs("display:flex;flex-direction:column;gap:16px;min-width:0")}>
          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);padding:18px")}>
            <div style={cs("display:flex;align-items:baseline;gap:11px;flex-wrap:wrap;margin-bottom:12px")}>
              <span style={cs("font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--mute)")}>Proposal #{p.id}</span>
              <span style={cs(`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;padding:3px 9px;border-radius:999px;border:1px solid var(--line);background:${st.bg};color:${st.fg}`)}>{p.status.toUpperCase()}</span>
            </div>
            <h1 style={cs(`margin:0 0 14px;font-size:${v.isMobile ? "18px" : "20px"};font-weight:700;letter-spacing:-.02em;line-height:1.35`)}>{p.description}</h1>
            <div style={cs("display:flex;gap:7px;flex-wrap:wrap")}>
              <AddressChip address={v.shortAddress(p.proposer)} full={p.proposer} />
              {v.chain.blockExplorerUrl && <LinkChip href={`${v.chain.blockExplorerUrl}/address/${p.governor}`}>Governor</LinkChip>}
            </div>
          </div>

          <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);padding:18px;display:flex;flex-direction:column;gap:16px")}>
            <div style={cs("font-size:14px;font-weight:700;letter-spacing:-.02em")}>Quorum</div>
            <QuorumBar label="Circulating supply voting FOR" pct={p.forShareBps / 100} met={p.quorumSupplyMet} />
            <QuorumBar label="Distinct holders participating" pct={p.participantShareBps / 100} met={p.quorumHeadcountMet} />
            <div style={cs("display:flex;gap:24px;flex-wrap:wrap;padding-top:6px;border-top:1px solid var(--soft)")}>
              <div>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>FOR</div>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:500;margin-top:5px;color:var(--pos)")}>{compactNumber(p.forVotes / 1e18)}</div>
              </div>
              <div>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>AGAINST</div>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:500;margin-top:5px;color:var(--neg)")}>{compactNumber(p.againstVotes / 1e18)}</div>
              </div>
              <div>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>ABSTAIN</div>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:500;margin-top:5px")}>{compactNumber(p.abstainVotes / 1e18)}</div>
              </div>
              <div>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:.14em;color:var(--mute)")}>PARTICIPANTS</div>
                <div style={cs("font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:500;margin-top:5px")}>{p.participantCount} / {p.eligibleHolders}</div>
              </div>
            </div>
          </div>

          {p.queued && !p.executed && (
            <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:16px 18px;font-size:13px;line-height:1.55")}>
              {timelockRemaining > 0
                ? `Queued in the 5-day timelock -- executable in ${Math.ceil(timelockRemaining / 3600)}h.`
                : "Timelock has elapsed -- ready to execute."}
            </div>
          )}
        </div>

        <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);padding:18px")}>
          {canVote ? (
            <>
              <div style={cs("font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.1em;color:var(--mute);margin-bottom:12px")}>CAST YOUR VOTE</div>
              <div style={cs("display:flex;flex-direction:column;gap:8px")}>
                <button onClick={() => vote("For")} style={cs("padding:12px;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;background:var(--lime);color:var(--on)")}>Vote For</button>
                <button onClick={() => vote("Against")} style={cs("padding:12px;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;background:var(--orange);color:#fff")}>Vote Against</button>
                <button onClick={() => vote("Abstain")} style={cs("padding:12px;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;background:var(--paper);color:var(--ink)")}>Abstain</button>
              </div>
              {!v.connected && <div style={cs("font-size:11.5px;color:var(--mute);margin-top:10px;text-align:center")}>Connect a wallet to vote.</div>}
            </>
          ) : p.queued && !p.executed && timelockRemaining <= 0 ? (
            <button onClick={execute} style={cs("width:100%;padding:13px;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:13.5px;font-weight:700;background:var(--lime);color:var(--on)")}>Execute</button>
          ) : (
            <div style={cs("font-size:13px;color:var(--mute);text-align:center;padding:8px 0")}>{p.status === "Pending" ? "Voting hasn't started yet." : p.status === "Executed" ? "This proposal already executed." : p.status === "Canceled" ? "This proposal was canceled." : "Voting has closed."}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Governance for this one token -- a lazily-cloned governor+timelock
// deployed on the token's first withdrawal proposal (see
// governance/DuckTokenGovernorFactory.sol). Lives as a TokenPage tab, not a
// cross-token proposal feed, matching the real 1:1 token<->governor
// relationship.
export default function GovernanceTab({ v }) {
  const [openId, setOpenId] = useState(null);
  const proposals = v.proposals || [];

  if (openId != null && v.proposalDetail && v.proposalDetail.id === openId) {
    return <ProposalDetail v={v} p={v.proposalDetail} onBack={() => setOpenId(null)} />;
  }
  if (openId != null) {
    return <div style={cs("padding:24px;font-size:13px;color:var(--mute)")}>Loading proposal…</div>;
  }

  return (
    <div style={cs("padding:16px 18px;display:flex;flex-direction:column;gap:14px")}>
      <div style={cs("font-size:12.5px;color:var(--mute);max-width:70ch;line-height:1.5")}>
        Only this token's own creator can propose moving funds out of its lending vault. Passing needs both a
        40% share of circulating supply voting FOR and 40% of distinct holders actually participating -- then a
        5-day timelock before it can execute.
      </div>

      {v.proposalsLoading && <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:32px;text-align:center;color:var(--mute);font-size:13.5px")}>Loading proposals…</div>}

      {!v.proposalsLoading && proposals.length === 0 && (
        <div style={cs("border:1px solid var(--line);border-radius:10px;background:var(--paper);padding:32px;text-align:center;color:var(--mute);font-size:13.5px")}>No proposals yet for this token.</div>
      )}

      {!v.proposalsLoading && proposals.length > 0 && (
        <div style={cs("display:flex;flex-direction:column;gap:10px")}>
          {proposals.map((p, i) => {
            const st = STATUS_STYLE[p.status] || STATUS_STYLE.Pending;
            return (
              <div
                key={i}
                onClick={() => { setOpenId(p.id); v.openProposal(p.id); }}
                className="d-hover-lime"
                style={cs("border:1px solid var(--line);border-radius:10px;background:var(--card);padding:14px 16px;cursor:pointer;display:flex;flex-direction:column;gap:9px")}
              >
                <div style={cs("display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap")}>
                  <span style={cs("font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute)")}>Proposal #{p.id}</span>
                  <span style={cs(`font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;padding:3px 9px;border-radius:999px;border:1px solid var(--line);background:${st.bg};color:${st.fg}`)}>{p.status.toUpperCase()}</span>
                </div>
                <div style={cs("font-size:13.5px;font-weight:600;letter-spacing:-.01em;line-height:1.4")}>{p.description}</div>
                <div style={cs("display:flex;gap:18px;flex-wrap:wrap;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--mute)")}>
                  <span>{(p.forShareBps / 100).toFixed(1)}% of supply FOR {p.quorumSupplyMet ? "✓" : "(needs 40%)"}</span>
                  <span>{(p.participantShareBps / 100).toFixed(1)}% of holders voted {p.quorumHeadcountMet ? "✓" : "(needs 40%)"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
