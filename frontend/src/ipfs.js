// Resolves a token's metaURI (an ipfs:// pointer to the small JSON blob
// written by backend/src/api/routes/upload.ts's /upload/metadata) into a
// displayable image URL. Nothing here is fake — if the token has no
// metaURI, or it doesn't point at real JSON with an `image` field (e.g. the
// plain-text fallback App.jsx uses when the metadata pin fails at creation
// time), this just resolves to null and the UI falls back to the colored
// placeholder instead of showing a broken image.
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";

export function ipfsToHttp(uri) {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) return PINATA_GATEWAY + uri.slice("ipfs://".length);
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  return null;
}

// Only http(s) links are ever rendered as an href -- metadata JSON is
// attacker-controlled (anyone can mint a token and point its metaURI at
// arbitrary content), so a bare string here could otherwise carry a
// javascript: URI. Bare handles/domains are treated as https:// for
// convenience.
export function normalizeSocialUrl(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

const metaCache = new Map();

function resolveTokenMeta(metaUri) {
  if (!metaUri) return Promise.resolve(null);
  if (metaCache.has(metaUri)) return metaCache.get(metaUri);

  const promise = (async () => {
    try {
      const url = ipfsToHttp(metaUri);
      if (!url) return null;
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  })();

  metaCache.set(metaUri, promise);
  return promise;
}

export function resolveTokenImage(metaUri) {
  return resolveTokenMeta(metaUri).then((data) => ipfsToHttp(data?.image) || null);
}

// { twitter, telegram, website } -> null entries dropped, each normalized/
// validated as an http(s) URL. Returns null (not {}) when nothing usable.
export function resolveTokenSocials(metaUri) {
  return resolveTokenMeta(metaUri).then((data) => {
    if (!data?.socials || typeof data.socials !== "object") return null;
    const out = {};
    for (const key of ["twitter", "telegram", "website"]) {
      const url = normalizeSocialUrl(data.socials[key]);
      if (url) out[key] = url;
    }
    return Object.keys(out).length ? out : null;
  });
}

export function resolveTokenDescription(metaUri) {
  return resolveTokenMeta(metaUri).then((data) => (typeof data?.description === "string" ? data.description : ""));
}

// Only meaningful for a DuckMetaOverride override URI -- the normal pipeline
// always shows the on-chain ERC20 name()/symbol() (indexed once at creation,
// immutable), never these JSON fields. An override can't touch the real
// contract, so this is how it corrects what's *displayed* instead. Returns
// null for either field the JSON doesn't provide, so callers can fall back
// to the original on-chain values field-by-field rather than blanking both.
export function resolveTokenNameSymbol(metaUri) {
  return resolveTokenMeta(metaUri).then((data) => ({
    name: typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null,
    symbol: typeof data?.symbol === "string" && data.symbol.trim() ? data.symbol.trim() : null,
  }));
}
