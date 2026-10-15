import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";

export const tokenHash = (token) =>
  createHash("sha256").update(token).digest("hex");
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
export function readSessionToken(req) {
  const bearer = req.headers.authorization;
  if (typeof bearer === "string" && bearer.startsWith("Bearer "))
    return bearer.slice(7);
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("pronto_session="));
  return cookie
    ? decodeURIComponent(cookie.slice("pronto_session=".length))
    : "";
}
export function authenticate(db, req) {
  const token = readSessionToken(req);
  if (!token || token.length > 160) return false;
  return Boolean(
    db
      .prepare("SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?")
      .get(tokenHash(token), Date.now()),
  );
}
export function issueSession(db, req, res, { secure = false } = {}) {
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
  db.prepare("INSERT INTO sessions(token_hash,expires_at) VALUES (?,?)").run(
    tokenHash(token),
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  );
  res.cookie("pronto_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  return req.headers["x-pronto-desktop"] === "1" ? { desktopToken: token } : {};
}
