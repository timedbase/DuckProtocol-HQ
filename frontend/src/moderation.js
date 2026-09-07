// Best-effort content filter for token name/ticker/description at creation
// time. This is a UI-layer guard only — anyone calling the contracts
// directly bypasses it entirely, since createToken/launch/createCampaign
// enforce no content rules on-chain. It exists to stop casual abuse through
// our own Create page, not to guarantee clean on-chain data.
const BLOCKED_TERMS = [
  "nigger", "nigga", "faggot", "retard", "spic", "chink", "kike", "tranny",
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

export function findBlockedTerm(...fields) {
  const joined = normalize(fields.join(" "));
  return BLOCKED_TERMS.find((term) => joined.includes(term)) || null;
}
