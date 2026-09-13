import { parseAbi } from "viem";

// Every function here is already permissionless -- DuckKeeper holds no
// special role in any of these contracts, it just calls what anyone could
// call, reliably, on a schedule.

export const HOOK_ABI = parseAbi([
  "function claimFees(bytes32 poolId) external",
  "function accruedFees(bytes32) view returns (uint256)",
]);

// DuckToken.processBatch() is NOT wired into _transfer at all (an ordinary transfer must never pay
// for advancing someone else's reward round), so it needs a reliable external trigger just like
// claimFees/triggerBuyback -- distributing/roundStart/DISTRIBUTION_INTERVAL let the keeper check
// whether there's real work before spending gas on a no-op call.
export const TOKEN_ABI = parseAbi([
  "function processBatch() external",
  "function distributing() view returns (bool)",
  "function roundStart() view returns (uint256)",
  "function DISTRIBUTION_INTERVAL() view returns (uint256)",
]);

export const VAULT_ABI = parseAbi([
  "function triggerBuyback() external returns (uint256)",
  "function pendingBuyback() view returns (uint128)",
]);
