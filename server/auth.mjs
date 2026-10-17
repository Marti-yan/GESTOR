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
export function readSessionToken(req, cookieName = "pronto_session") {
  const bearer = req.headers.authorization;
  if (typeof bearer === "string" && bearer.startsWith("Bearer "))
    return bearer.slice(7);
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName + "="));
  try {
    return cookie
      ? decodeURIComponent(cookie.slice(cookieName.length + 1))
      : "";
  } catch {
    return "";
  }
}
export function authenticate(db, req) {
  const token = readSessionToken(req);
  if (!token || token.length > 160) return false;
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>? AND role='admin'",
      )
      .get(tokenHash(token), Date.now()),
  );
}
export function staffSession(db, req) {
  const token = readSessionToken(req, "pronto_staff_session");
  if (!token || token.length > 160) return null;
  return (
    db
      .prepare(
        "SELECT actor_name AS name FROM sessions WHERE token_hash=? AND expires_at>? AND role='waiter'",
      )
      .get(tokenHash(token), Date.now()) || null
  );
}
export function issueStaffSession(db, res, name, { secure = false } = {}) {
  const token = randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO sessions(token_hash,expires_at,role,actor_name) VALUES (?,?,'waiter',?)",
  ).run(tokenHash(token), Date.now() + 12 * 60 * 60 * 1000, name);
  res.cookie("pronto_staff_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
  });
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
