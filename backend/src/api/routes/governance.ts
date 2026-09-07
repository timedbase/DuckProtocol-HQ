import { Router } from "express";
import { getAddress, parseAbi } from "viem";
import { querySubgraph } from "../../subgraph/client.js";
import type { ChainSlug } from "../../chain/registry.js";
import { getPublicClient } from "../../chain/client.js";

// The dead/burn address every circulating-supply calculation in this stack
// excludes -- same address DuckVaultConfig/DuckToken's own on-chain
// accounting uses.
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";
const QUORUM_BPS = 4000; // 40% of circulating supply FOR, and 40% of holders participating -- both fixed, non-tunable thresholds on DuckTokenGovernor.

const GOVERNOR_ABI = parseAbi([
  "function proposalVotes(uint256) view returns (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes)",
  "function state(uint256) view returns (uint8)",
  "function proposalSnapshot(uint256) view returns (uint256)",
  "function proposalEta(uint256) view returns (uint256)",
]);
const TOKEN_VOTES_ABI = parseAbi([
  "function getPastTotalSupply(uint256) view returns (uint256)",
  "function getPastVotes(address,uint256) view returns (uint256)",
  "function getPastHolderCount(uint256) view returns (uint256)",
]);

// Real OZ Governor state enum (IGovernor.ProposalState) -- richer than a
// flat "queued/executed/canceled" flag set, so it's surfaced directly
// rather than collapsed into a lossy summary.
const STATE_NAMES = ["Pending", "Active", "Canceled", "Defeated", "Succeeded", "Queued", "Expired", "Executed"] as const;

type SubgraphProposal = {
  id: string; proposalId: string; proposer: string | null; description: string | null;
  voteStart: string | null; voteEnd: string | null; etaSeconds: string | null;
  canceled: boolean; queued: boolean; executed: boolean;
  targets: string[] | null; values: string[] | null; calldatas: string[] | null;
  governor: { id: string; vault: { id: string; token: { id: string } } };
};

async function enrichProposal(chain: ChainSlug, p: SubgraphProposal) {
  const client = getPublicClient(chain);
  const governor = getAddress(p.governor.id);
  const tokenAddr = getAddress(p.governor.vault.token.id);
  const proposalIdBn = BigInt(p.proposalId);

  const [state, votes, snapshot] = await Promise.all([
    client.readContract({ address: governor, abi: GOVERNOR_ABI, functionName: "state", args: [proposalIdBn] }),
    client.readContract({ address: governor, abi: GOVERNOR_ABI, functionName: "proposalVotes", args: [proposalIdBn] }),
    client.readContract({ address: governor, abi: GOVERNOR_ABI, functionName: "proposalSnapshot", args: [proposalIdBn] }),
  ]);
  const [againstVotes, forVotes, abstainVotes] = votes;

  // Circulating supply and eligible-holder count are both snapshotted at
  // proposal creation (the same block the on-chain quorum check itself
  // uses) -- not today's live numbers, which would make an old proposal's
  // quorum math drift from what it actually passed/failed against on-chain.
  const [totalSupplyAtSnapshot, deadVotesAtSnapshot, holdersAtSnapshot] = await Promise.all([
    client.readContract({ address: tokenAddr, abi: TOKEN_VOTES_ABI, functionName: "getPastTotalSupply", args: [snapshot] }).catch(() => 0n),
    client.readContract({ address: tokenAddr, abi: TOKEN_VOTES_ABI, functionName: "getPastVotes", args: [getAddress(DEAD_ADDRESS), snapshot] }).catch(() => 0n),
    client.readContract({ address: tokenAddr, abi: TOKEN_VOTES_ABI, functionName: "getPastHolderCount", args: [snapshot] }).catch(() => 0n),
  ]);
  const circulatingSupply = totalSupplyAtSnapshot > deadVotesAtSnapshot ? totalSupplyAtSnapshot - deadVotesAtSnapshot : 0n;

  // Participant headcount: the contract's own _countVote already rejects a
  // zero-weight voter before a Vote entity is ever written, so every row
  // here already represents a real, weighted participant -- counting rows
  // needs no extra weight re-check.
  const voteCountData = await querySubgraph<{ votes: { id: string }[] }>(
    chain,
    `query VoteCount($proposal: String!) { votes(where: { proposal: $proposal, support_in: [0, 1] }, first: 1000) { id } }`,
    { proposal: p.id }
  );
  const participantCount = voteCountData.votes.length;

  const forShareBps = circulatingSupply > 0n ? Number((forVotes * 10000n) / circulatingSupply) : 0;
  const participantShareBps = holdersAtSnapshot > 0n ? Math.round((participantCount * 10000) / Number(holdersAtSnapshot)) : 0;

  return {
    id: p.id,
    proposalId: p.proposalId,
    governor: p.governor.id,
    vault: p.governor.vault.id,
    token: p.governor.vault.token.id,
    proposer: p.proposer,
    description: p.description,
    status: STATE_NAMES[state] ?? "Pending",
    canceled: p.canceled,
    queued: p.queued,
    executed: p.executed,
    voteStart: p.voteStart,
    voteEnd: p.voteEnd,
    etaSeconds: p.etaSeconds,
    // Needed to build a real execute() call client-side (targets/values/
    // calldatas must match exactly what propose() submitted, or the
    // descriptionHash-derived proposal id won't match on-chain).
    targets: p.targets ?? [],
    values: (p.values ?? []).map(String),
    calldatas: p.calldatas ?? [],
    forVotes: forVotes.toString(),
    againstVotes: againstVotes.toString(),
    abstainVotes: abstainVotes.toString(),
    circulatingSupply: circulatingSupply.toString(),
    participantCount,
    eligibleHolders: Number(holdersAtSnapshot),
    forShareBps,
    participantShareBps,
    quorumSupplyMet: forShareBps >= QUORUM_BPS,
    quorumHeadcountMet: participantShareBps >= QUORUM_BPS,
  };
}

const PROPOSAL_FIELDS = `
  id proposalId proposer description voteStart voteEnd etaSeconds canceled queued executed
  targets values calldatas
  governor { id vault { id token { id } } }
`;

export default function createGovernanceRouter(chain: ChainSlug) {
  const router = Router();

  router.get("/proposals", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token.toLowerCase() : undefined;
    try {
      // No governor deployed yet (lazily cloned on a token's FIRST proposal)
      // is the normal case for most tokens -- an empty list, not an error.
      let governorId: string | null = null;
      if (token) {
        const vaultData = await querySubgraph<{ vaults: { governor: string | null }[] }>(
          chain,
          `query VaultGovernor($token: String!) { vaults(where: { token: $token }, first: 1) { governor } }`,
          { token }
        );
        governorId = vaultData.vaults[0]?.governor?.toLowerCase() ?? null;
        if (!governorId) return res.json([]);
      }

      const data = await querySubgraph<{ proposals: SubgraphProposal[] }>(
        chain,
        `query Proposals($where: Proposal_filter) {
          proposals(first: 200, orderBy: createdAtBlock, orderDirection: desc, where: $where) {
            ${PROPOSAL_FIELDS}
          }
        }`,
        { where: governorId ? { governor: governorId } : {} }
      );
      res.json(await Promise.all(data.proposals.map((p) => enrichProposal(chain, p))));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.get("/proposals/:id", async (req, res) => {
    try {
      const data = await querySubgraph<{ proposal: SubgraphProposal | null }>(
        chain,
        `query ProposalDetail($id: String!) { proposal(id: $id) { ${PROPOSAL_FIELDS} } }`,
        { id: req.params.id }
      );
      if (!data.proposal) return res.status(404).json({ error: "not found" });
      res.json(await enrichProposal(chain, data.proposal));
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  return router;
}
