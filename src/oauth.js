import crypto from "node:crypto";

const TOKEN_TTL_SECONDS = 3600;

const tokens = new Map();

function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function readClientCreds(req) {
  const auth = req.headers.authorization ?? "";
  if (auth.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep === -1) return { clientId: decoded, clientSecret: "" };
    return { clientId: decoded.slice(0, sep), clientSecret: decoded.slice(sep + 1) };
  }
  return {
    clientId: req.body?.client_id ?? "",
    clientSecret: req.body?.client_secret ?? "",
  };
}

export function tokenHandler({ clientId, clientSecret }) {
  return (req, res) => {
    const grantType = req.body?.grant_type;
    if (grantType !== "client_credentials") {
      return res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "Only client_credentials is supported",
      });
    }

    const creds = readClientCreds(req);
    if (
      !creds.clientId ||
      !creds.clientSecret ||
      !timingSafeEqual(creds.clientId, clientId) ||
      !timingSafeEqual(creds.clientSecret, clientSecret)
    ) {
      return res.status(401).json({
        error: "invalid_client",
        error_description: "Client authentication failed",
      });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
    tokens.set(token, expiresAt);

    return res.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: TOKEN_TTL_SECONDS,
    });
  };
}

function checkBearer(header) {
  const token = header.slice(7);
  const expiresAt = tokens.get(token);
  if (!expiresAt) return { ok: false, error: "Invalid token" };
  if (Date.now() > expiresAt) {
    tokens.delete(token);
    return { ok: false, error: "Token expired" };
  }
  return { ok: true };
}

function checkBasic(header, basicUser, basicPassword) {
  if (!basicUser || !basicPassword) {
    return { ok: false, error: "Basic auth not configured" };
  }
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  const user = sep === -1 ? decoded : decoded.slice(0, sep);
  const pass = sep === -1 ? "" : decoded.slice(sep + 1);
  if (
    !timingSafeEqual(user, basicUser) ||
    !timingSafeEqual(pass, basicPassword)
  ) {
    return { ok: false, error: "Invalid credentials" };
  }
  return { ok: true };
}

export function authMiddleware({ basicUser, basicPassword } = {}) {
  return (req, res, next) => {
    const header = req.headers.authorization ?? "";

    if (header.startsWith("Bearer ")) {
      const result = checkBearer(header);
      if (!result.ok) return res.status(401).json({ error: result.error });
      return next();
    }

    if (header.startsWith("Basic ")) {
      const result = checkBasic(header, basicUser, basicPassword);
      if (!result.ok) return res.status(401).json({ error: result.error });
      return next();
    }

    res.set("WWW-Authenticate", 'Bearer realm="coral-cloud-pms", Basic realm="coral-cloud-pms"');
    return res.status(401).json({ error: "Authentication required" });
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of tokens) {
    if (now > expiresAt) tokens.delete(token);
  }
}, 60_000).unref();
