// The one place that knows which chains this API serves. Every route is a
// factory parameterized by ChainSlug (see api/routes/*.ts), mounted once per
// chain in api/index.ts under /<slug>/...

export type ChainSlug = "robinhood" | "ink";

export const CHAIN_SLUGS: ChainSlug[] = ["robinhood", "ink"];

export function isChainSlug(value: string): value is ChainSlug {
  return (CHAIN_SLUGS as string[]).includes(value);
}
