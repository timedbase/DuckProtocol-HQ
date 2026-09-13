// ABIs extracted from the DuckProtocol build (deploy/out/<Contract>.sol/<Contract>.json's `abi`),
// the same build the subgraphs index. The backend relies on the subgraph for indexed data; these
// are for light RPC reads of platform config that isn't worth indexing.
import DuckBondingCurveJson from "./abis-json/DuckBondingCurve.json" with { type: "json" };
import DuckLauncherJson from "./abis-json/DuckLauncher.json" with { type: "json" };
import DuckCrowdfundJson from "./abis-json/DuckCrowdfund.json" with { type: "json" };
import DuckHookV4Json from "./abis-json/DuckHookV4.json" with { type: "json" };
import DuckVaultFactoryJson from "./abis-json/DuckVaultFactory.json" with { type: "json" };
import DuckVaultConfigJson from "./abis-json/DuckVaultConfig.json" with { type: "json" };
import DuckVaultJson from "./abis-json/DuckVault.json" with { type: "json" };
import DuckTokenGovernorFactoryJson from "./abis-json/DuckTokenGovernorFactory.json" with { type: "json" };
import DuckTokenGovernorJson from "./abis-json/DuckTokenGovernor.json" with { type: "json" };
import TimelockControllerJson from "./abis-json/TimelockControllerUpgradeable.json" with { type: "json" };
import DuckTokenJson from "./abis-json/DuckToken.json" with { type: "json" };

export const DUCK_BONDING_CURVE_ABI = DuckBondingCurveJson;
export const DUCK_LAUNCHER_ABI = DuckLauncherJson;
export const DUCK_CROWDFUND_ABI = DuckCrowdfundJson;
export const DUCK_HOOK_ABI = DuckHookV4Json;
export const DUCK_VAULT_FACTORY_ABI = DuckVaultFactoryJson;
export const DUCK_VAULT_CONFIG_ABI = DuckVaultConfigJson;
export const DUCK_VAULT_ABI = DuckVaultJson;
export const DUCK_TOKEN_GOVERNOR_FACTORY_ABI = DuckTokenGovernorFactoryJson;
export const DUCK_TOKEN_GOVERNOR_ABI = DuckTokenGovernorJson;
export const TIMELOCK_CONTROLLER_ABI = TimelockControllerJson;
export const DUCK_TOKEN_ABI = DuckTokenJson;
