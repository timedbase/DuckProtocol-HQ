import { getAddress, type Address, type Abi, type Hex } from "viem";
import { fetchAllVaults } from "./subgraph.js";
import { chains, keeperAddress, dryRun, type KeeperChain } from "./chain.js";
import { HOOK_ABI, VAULT_ABI, TOKEN_ABI } from "./abi.js";

// DuckKeeper drives three permissionless triggers on every chain: DuckHookV4.claimFees,
// DuckVault.triggerBuyback and DuckToken.processBatch. None of them run inside ordinary transfers or
// swaps, so without an external caller fees and holder rewards would sit undistributed.

async function submit(c: KeeperChain, label: string, address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) {
  if (dryRun) {
    console.log(`[${c.slug}] [dry-run] would call ${label}`);
    return;
  }
  const hash = await c.walletClient.writeContract({ address, abi, functionName: functionName as never, args: args as never, chain: c.walletClient.chain, account: c.walletClient.account });
  await c.publicClient.waitForTransactionReceipt({ hash });
  console.log(`[${c.slug}] ${label}: ${hash}`);
}

async function tryClaimFees(c: KeeperChain, hook: Address, poolId: Hex) {
  const accrued = await c.publicClient
    .readContract({ address: hook, abi: HOOK_ABI, functionName: "accruedFees", args: [poolId] })
    .catch(() => 0n);
  if (accrued === 0n) return;
  await submit(c, `claimFees(${poolId}) on hook ${hook} (accrued ${accrued})`, hook, HOOK_ABI, "claimFees", [poolId]);
}

async function tryTriggerBuyback(c: KeeperChain, vault: Address) {
  const pending = await c.publicClient
    .readContract({ address: vault, abi: VAULT_ABI, functionName: "pendingBuyback" })
    .catch(() => 0n);
  if (pending === 0n) return;
  await submit(c, `triggerBuyback() on vault ${vault} (pending ${pending})`, vault, VAULT_ABI, "triggerBuyback");
}

async function tryProcessBatch(c: KeeperChain, token: Address) {
  // Any read failure means "can't tell, skip" -- defaulting to false/0n would make `due` true
  // unconditionally and submit an always-reverting transaction every run.
  let distributing: boolean;
  let roundStart: bigint;
  let interval: bigint;
  try {
    [distributing, roundStart, interval] = await Promise.all([
      c.publicClient.readContract({ address: token, abi: TOKEN_ABI, functionName: "distributing" }),
      c.publicClient.readContract({ address: token, abi: TOKEN_ABI, functionName: "roundStart" }),
      c.publicClient.readContract({ address: token, abi: TOKEN_ABI, functionName: "DISTRIBUTION_INTERVAL" }),
    ]);
  } catch {
    return;
  }
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const due = distributing || nowSec >= roundStart + interval;
  if (!due) return;
  await submit(c, `processBatch() on token ${token} (distributing=${distributing})`, token, TOKEN_ABI, "processBatch");
}

async function runChain(c: KeeperChain) {
  const vaults = await fetchAllVaults(c.subgraphUrl);
  console.log(`[${c.slug}] found ${vaults.length} vault(s)`);

  for (const v of vaults) {
    if (!v.enabled) continue;

    if (v.token.hook && v.poolId) {
      try {
        await tryClaimFees(c, getAddress(v.token.hook), v.poolId as Hex);
      } catch (err) {
        console.error(`[${c.slug}] claimFees failed for pool ${v.poolId} (hook ${v.token.hook}):`, err);
      }
    }

    const vaultAddr = getAddress(v.id);
    try {
      await tryTriggerBuyback(c, vaultAddr);
    } catch (err) {
      console.error(`[${c.slug}] triggerBuyback failed for vault ${vaultAddr}:`, err);
    }

    try {
      await tryProcessBatch(c, getAddress(v.token.id));
    } catch (err) {
      console.error(`[${c.slug}] processBatch failed for token ${v.token.id}:`, err);
    }
  }
}

async function main() {
  console.log(
    `DuckKeeper starting${dryRun ? " (dry run)" : ""} on ${chains.map((c) => c.slug).join(", ")} -- operating as ${keeperAddress}, no special role in any contract`
  );

  // One chain failing (RPC or subgraph down) doesn't stop the others.
  let failed = false;
  for (const c of chains) {
    try {
      await runChain(c);
    } catch (err) {
      failed = true;
      console.error(`[${c.slug}] run failed:`, err);
    }
  }

  console.log("DuckKeeper run complete");
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("DuckKeeper run failed:", err);
  process.exitCode = 1;
});
