import { keccak256, encodeAbiParameters, concat, getAddress, pad, toHex } from "viem";

// DuckIncubation, DuckLauncher and DuckRaise all clone their token template
// via CREATE2 with the identical derivation (confirmed directly against
// the Duck-Family-Contract repo's source, not just the shared test helper's comment):
//   realSalt = keccak256(abi.encode(msg.sender, userSalt))
//   predicted = last20Bytes(keccak256(0xff ++ deployer ++ realSalt ++ initCodeHash))
//   initCodeHash = keccak256(EIP-1167 minimal-proxy bytecode for `impl`)
// The contract requires the low 16 bits of the predicted address to equal
// 0x8888 (VANITY_SUFFIX) — this mines the small integer `userSalt` that
// satisfies that, entirely client-side, no RPC calls in the loop.

const VANITY_SUFFIX = 0x8888n;
const MAX_ITERATIONS = 3_000_000;

function eip1167InitCodeHash(impl) {
  const bytecode = concat([
    "0x3d602d80600a3d3981f3363d3d373d3d3d363d73",
    impl,
    "0x5af43d82803e903d91602b57fd5bf3",
  ]);
  return keccak256(bytecode);
}

function predictCloneAddress(deployer, realSalt, initCodeHash) {
  const packed = concat(["0xff", deployer, realSalt, initCodeHash]);
  const hash = keccak256(packed);
  return getAddress("0x" + hash.slice(-40));
}

// deployer: the launcher/curve contract address doing the CREATE2.
// impl: the EIP-1167 clone template it clones.
// caller: the connected wallet address that will actually submit the tx
//         (msg.sender at call time — the derivation is keyed to this).
export function mineVanitySalt({ deployer, impl, caller }) {
  const initCodeHash = eip1167InitCodeHash(impl);
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const realSalt = keccak256(
      encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [caller, BigInt(i)])
    );
    const predicted = predictCloneAddress(deployer, realSalt, initCodeHash);
    if ((BigInt(predicted) & 0xffffn) === VANITY_SUFFIX) {
      return { userSalt: pad(toHex(i), { size: 32 }), predictedAddress: predicted, iterations: i + 1 };
    }
  }
  throw new Error("Vanity salt mining exhausted " + MAX_ITERATIONS + " iterations without a match.");
}
