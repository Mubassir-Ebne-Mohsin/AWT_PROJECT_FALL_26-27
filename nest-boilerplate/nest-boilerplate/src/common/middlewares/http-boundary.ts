import type { RequestHandler } from "express";

/** Browser CSRF boundary; bearer authentication and OAuth state checks remain required. */
export function httpBoundary(allowedOrigins: readonly string[]): RequestHandler {
  const trusted = new Set(allowedOrigins);
  return (req, res, next) => {
    // Tokens, account data and error responses must not enter a browser/shared cache.
    res.setHeader("Cache-Control", "private, no-store");
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.headers.origin;
    const site = req.headers["sec-fetch-site"];
    let canonical = false;
    if (typeof origin === "string") {
      try {
        const url = new URL(origin);
        canonical = ["http:", "https:"].includes(url.protocol) && url.origin === origin;
      } catch { /* Opaque/malformed origins are never trusted. */ }
    }
    // Fetch Metadata is browser-controlled. Same-origin permits Swagger on the API
    // origin without trusting Host or forwarded headers. CLI clients can omit both
    // headers; they still need normal credentials for protected operations.
    const accepted = origin !== undefined
      ? canonical && (trusted.has(origin) || site === "same-origin")
      : site === undefined || site === "none" || site === "same-origin";
    if (!accepted) {
      res.status(403).json({ error: {
        code: "FORBIDDEN", message: "This request must start on a trusted StressForge origin",
      } });
      return;
    }
    next();
  };
}
