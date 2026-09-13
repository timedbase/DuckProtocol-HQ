import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import multer from "multer";
import createTokensRouter from "./routes/tokens.js";
import createCampaignsRouter from "./routes/campaigns.js";
import createPortfolioRouter from "./routes/portfolio.js";
import createPlatformRouter from "./routes/platform.js";
import createPriceRouter from "./routes/price.js";
import createVaultsRouter from "./routes/vaults.js";
import createGovernanceRouter from "./routes/governance.js";
import uploadRouter from "./routes/upload.js";
import createCommentsRouter from "./routes/comments.js";
import { CHAIN_SLUGS } from "../chain/registry.js";
import { ensureSchema } from "../db/client.js";
import { startHealthChecks, getSubgraphHealth } from "../health.js";

const app = express();
// Render puts one reverse proxy in front of this service, which sets
// X-Forwarded-For -- without this, express-rate-limit refuses to trust that
// header (correctly, as a default anti-spoofing guard) and throws on every
// request instead of rate-limiting by real client IP. Trusting exactly one
// hop matches Render's actual topology.
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.get("/health", (_req, res) => res.json({ ok: true, chains: getSubgraphHealth() }));

// Every data route is chain-scoped under /robinhood or /ink (see
// chain/registry.ts) -- each factory below is called once per chain, closing
// over which chain's RPC client/subgraph/addresses it reads from. /upload stays
// unprefixed: pinning metadata to IPFS has nothing chain-specific about it.
for (const chain of CHAIN_SLUGS) {
  app.use(`/${chain}/tokens`, createTokensRouter(chain));
  app.use(`/${chain}/tokens`, createCommentsRouter(chain));
  app.use(`/${chain}/campaigns`, createCampaignsRouter(chain));
  app.use(`/${chain}/portfolio`, createPortfolioRouter(chain));
  app.use(`/${chain}/price`, createPriceRouter(chain));
  app.use(`/${chain}/vaults`, createVaultsRouter(chain));
  app.use(`/${chain}/governance`, createGovernanceRouter(chain));
  app.use(`/${chain}`, createPlatformRouter(chain));
}
app.use("/upload", uploadRouter);

// Every route handler's own try/catch returns a uniform { error } JSON body
// -- but multer's fileFilter/size-limit rejection and express.json()'s
// malformed-body parsing both throw/next(err) from middleware that runs
// BEFORE any route handler, bypassing those try/catches entirely. Without
// this, both fall through to Express's default HTML error page with the
// wrong status code, which a frontend expecting { error } either can't
// parse or mishandles.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: err.message });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "malformed request body" });
  }
  res.status(err?.status ?? 500).json({ error: err instanceof Error ? err.message : "internal error" });
};
app.use(errorHandler);

// Best-effort: DATABASE_URL missing/unreachable logs a warning and leaves
// comments 503ing rather than taking the whole API down over one optional
// subsystem (see db/client.ts).
ensureSchema()
  .then(() => console.log("comments schema ready"))
  .catch((err) => console.warn("comments storage unavailable:", err instanceof Error ? err.message : err));

startHealthChecks();

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`duckpad.fun api listening on :${port}`);
});
