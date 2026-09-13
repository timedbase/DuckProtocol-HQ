import { parseAbi } from "viem";

// ABIs extracted from the DuckProtocol build (deploy/out/<Contract>.sol/<Contract>.json's `abi`) --
// the deployed contract build. Full JSON ABIs rather than hand-typed signatures, since
// several calls take wide structs that are easy to get subtly wrong by hand.
import DuckBondingCurveJson from "./abis-json/DuckBondingCurve.json";
import DuckBondingCurveViewsJson from "./abis-json/DuckBondingCurveViews.json";
import DuckLauncherJson from "./abis-json/DuckLauncher.json";
import DuckCrowdfundJson from "./abis-json/DuckCrowdfund.json";
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
export const DUCK_HOOK_ABI = DuckHookV4Json;
export const DUCK_VAULT_FACTORY_ABI = DuckVaultFactoryJson;
export const DUCK_VAULT_CONFIG_ABI = DuckVaultConfigJson;
export const DUCK_VAULT_ABI = DuckVaultJson;
export const DUCK_TOKEN_GOVERNOR_FACTORY_ABI = DuckTokenGovernorFactoryJson;
export const DUCK_TOKEN_GOVERNOR_ABI = DuckTokenGovernorJson;
export const TIMELOCK_CONTROLLER_ABI = TimelockControllerJson;
// The ERC20 every family clones -- balanceOf/approve/metaURI/vault()/reward state all live here.
export const DUCK_TOKEN_ABI = DuckTokenJson;

// Canonical Permit2, identical on both chains.
export const PERMIT2_ABI = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);

export const UNIVERSAL_ROUTER_ABI = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);

// Both chains' V4 Quoters take the same 4-field QuoteExactSingleParams.
export const V4_QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)",
]);
