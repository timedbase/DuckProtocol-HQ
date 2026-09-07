// The one place that knows which chains this API serves. DuckProtocol is
// Robinhood Chain only -- every route is still a factory function
// parameterized by ChainSlug (see api/routes/*.ts), mounted once in
// api/index.ts, kept as a factory (not a bare singleton) purely so a future
// second chain doesn't mean rewriting every route's shape again.

export type ChainSlug = "robinhood";

export const CHAIN_SLUGS: ChainSlug[] = ["robinhood"];

export function isChainSlug(value: string): value is ChainSlug {
  return (CHAIN_SLUGS as string[]).includes(value);
}
