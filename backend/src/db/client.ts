import "dotenv/config";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

// Comments/chat is the only subsystem backed by this -- everything else in
// the API stays subgraph/RPC-sourced. Unlike subgraph/client.ts (which
// throws at import time since every route needs it), this stays optional:
// a deployment with no DATABASE_URL set still boots and serves every other
// route fine, it just 503s the comments endpoints instead of refusing to
// start entirely.
export const pool = DATABASE_URL
  ? new pg.Pool({
      connectionString: DATABASE_URL,
      // Render's managed Postgres terminates TLS with a cert that isn't in
      // the default trust chain from inside its own network -- this is the
      // standard "trust it's Render, don't trust the world" setting for
      // that case. A local dev DB (loopback in the URL) skips TLS entirely.
      ssl: /^postgres(?:ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
    })
  : null;

let schemaReady: Promise<void> | null = null;

// Idempotent, run once at startup (see api/index.ts) and memoized so a
// request racing the very first call doesn't fire a second CREATE TABLE.
export function ensureSchema(): Promise<void> {
  if (!pool) return Promise.reject(new Error("DATABASE_URL is not set"));
  if (!schemaReady) {
    // `chain` ('robinhood' | 'ink') is written explicitly on every insert.
    // The 'ink' default only exists so the ALTER TABLE path could backfill a
    // table created before the column did. A discriminator matters because
    // token addresses are not unique across chains -- both chains share one
    // CREATE2 deployer -- so without it a thread could mix two unrelated
    // tokens' comments.
    schemaReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS comments (
          id BIGSERIAL PRIMARY KEY,
          chain TEXT NOT NULL DEFAULT 'ink',
          token_address TEXT NOT NULL,
          wallet TEXT NOT NULL,
          tag TEXT NOT NULL DEFAULT 'HOLDER',
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE comments ADD COLUMN IF NOT EXISTS chain TEXT NOT NULL DEFAULT 'ink';
        DROP INDEX IF EXISTS comments_token_address_idx;
        CREATE INDEX IF NOT EXISTS comments_chain_token_address_idx ON comments (chain, token_address, created_at DESC, id DESC);
      `)
      .then(() => {});
  }
  return schemaReady;
}
