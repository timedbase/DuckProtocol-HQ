import { parseAbi } from "viem";

// Real, complete ABIs pulled straight from `forge inspect <Contract> abi`
// against the DuckProtocol repo (same source used for the DuckProtocol-RH
// subgraph's ABIs) -- not hand-transcribed. Using the full ABI rather than a
// curated parseAbi subset here specifically because several DuckProtocol
// functions take wide structs (BaseParams, LaunchParams, ...) that are easy
// to get subtly wrong hand-typing as a human-readable signature string; the
// full JSON ABI can't drift from the real contract the way a hand-picked
// subset can.
import DuckBondingCurveJson from "./abis-json/DuckBondingCurve.json";
import DuckBondingCurveViewsJson from "./abis-json/DuckBondingCurveViews.json";
import DuckLauncherJson from "./abis-json/DuckLauncher.json";
import DuckCrowdfundJson from "./abis-json/DuckCrowdfund.json";
import DuckLockerJson from "./abis-json/DuckLocker.json";
import DuckHookV4Json from "./abis-json/DuckHookV4.json";
import DuckVaultFactoryJson from "./abis-json/DuckVaultFactory.json";
import DuckVaultConfigJson from "./abis-json/DuckVaultConfig.json";
import DuckVaultJson from "./abis-json/DuckVault.json";
import DuckTokenGovernorFactoryJson from "./abis-json/DuckTokenGovernorFactory.json";
import DuckTokenGovernorJson from "./abis-json/DuckTokenGovernor.json";
import TimelockControllerJson from "./abis-json/TimelockControllerUpgradeable.json";
import DuckTokenJson from "./abis-json/DuckToken.json";

export const DUCK_BONDING_CURVE_ABI = DuckBondingCurveJson;
export const DUCK_BONDING_CURVE_VIEWS_ABI = DuckBondingCurveViewsJson;
export const DUCK_LAUNCHER_ABI = DuckLauncherJson;
export const DUCK_CROWDFUND_ABI = DuckCrowdfundJson;
export const DUCK_LOCKER_ABI = DuckLockerJson;
export const DUCK_HOOK_ABI = DuckHookV4Json;
export const DUCK_VAULT_FACTORY_ABI = DuckVaultFactoryJson;
export const DUCK_VAULT_CONFIG_ABI = DuckVaultConfigJson;
export const DUCK_VAULT_ABI = DuckVaultJson;
export const DUCK_TOKEN_GOVERNOR_FACTORY_ABI = DuckTokenGovernorFactoryJson;
export const DUCK_TOKEN_GOVERNOR_ABI = DuckTokenGovernorJson;
export const TIMELOCK_CONTROLLER_ABI = TimelockControllerJson;
// DuckToken is the ERC20 every family clones -- Transfer/Approval/balanceOf/
// permit/vault()/etc. all live on this one ABI, replacing the legacy
// launchpad's separate ERC20_ABI (DuckProtocol has one shared token
// implementation across all three families, not three).
export const DUCK_TOKEN_ABI = DuckTokenJson;

// Canonical Permit2, identical on every chain it's deployed to.
export const PERMIT2_ABI = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);

// Verified against Robinhood Chain's real deployed Universal Router (see
// deploy/deployments/robinhood.json / Uniswap's own v4 deployment docs) --
// same interface shape as every other UniversalRouter deployment.
export const UNIVERSAL_ROUTER_ABI = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);

// Verified against Robinhood Chain's real deployed V4 Quoter.
export const V4_QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)",
]);
