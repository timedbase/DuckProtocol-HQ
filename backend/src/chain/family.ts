// The subgraph's real TokenFamily enum (DuckProtocol-RH/schema.graphql) is
// PascalCase: BondingCurve / Launcher / Crowdfund. The frontend's entire
// vocabulary -- adapters.js, App.jsx's routing (openToken sends "CAMPAIGN"
// to CampaignPage, everything else to TokenPage), DiscoverPage's filter
// tabs -- has always used CURVE / INSTANT / CAMPAIGN instead (this predates
// the real subgraph; demo data was hand-written to match the frontend's
// existing assumption, never validated against the real enum casing). This
// is the one place that translates between the two, so every route
// returning a token's family stays consistent with what the frontend
// already expects, and no frontend file needs to learn the subgraph's own
// casing.
const SUBGRAPH_TO_FRONTEND: Record<string, string> = {
  BondingCurve: "CURVE",
  Launcher: "INSTANT",
  Crowdfund: "CAMPAIGN",
};
const FRONTEND_TO_SUBGRAPH: Record<string, string> = {
  CURVE: "BondingCurve",
  INSTANT: "Launcher",
  CAMPAIGN: "Crowdfund",
};

export function familyToFrontend(subgraphFamily: string | null | undefined): string | null {
  if (!subgraphFamily) return null;
  return SUBGRAPH_TO_FRONTEND[subgraphFamily] ?? subgraphFamily;
}

// Accepts either casing on the way in (a query param a client already sent
// as "CURVE", or -- forward-compatible -- the real "BondingCurve" directly)
// so a stale client/bookmark never silently 404s a filter into an empty list.
export function familyToSubgraph(frontendFamily: string | null | undefined): string | null {
  if (!frontendFamily) return null;
  return FRONTEND_TO_SUBGRAPH[frontendFamily] ?? frontendFamily;
}
