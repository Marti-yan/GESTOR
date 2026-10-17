import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
export const clean = (v, n = 200) =>
  typeof v === "string" ? v.trim().slice(0, n) : "";
export function setting(db, key, fallback = {}) {
  return JSON.parse(
    db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value ||
      JSON.stringify(fallback),
  );
}
export function saveSetting(db, key, value) {
  db.prepare(
    "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, JSON.stringify(value));
}
export function secretVault(db, directory) {
  const file = join(directory, "provider.key");
  const key = () => {
    if (!existsSync(file)) {
      mkdirSync(directory, { recursive: true });
      try {
        writeFileSync(file, randomBytes(32), { flag: "wx", mode: 0o600 });
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }
    }
    return readFileSync(file);
  };
  return {
    set(name, value) {
      if (!value) {
        db.prepare("DELETE FROM provider_secrets WHERE name=?").run(name);
        return;
      }
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key(), iv),
        encrypted = Buffer.concat([
          cipher.update(value, "utf8"),
          cipher.final(),
        ]);
      db.prepare(
        "INSERT INTO provider_secrets VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
      ).run(
        name,
        Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64"),
      );
    },
    get(name) {
      const row = db
        .prepare("SELECT value FROM provider_secrets WHERE name=?")
        .get(name);
      if (!row) return "";
      if (!existsSync(file))
        throw Error(
          "A chave local dos provedores não foi encontrada. Restaure o backup ou recadastre as credenciais.",
        );
      const b = Buffer.from(row.value, "base64"),
        cipher = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
      cipher.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([
        cipher.update(b.subarray(28)),
        cipher.final(),
      ]).toString("utf8");
    },
    has(name) {
      return !!db
        .prepare("SELECT 1 FROM provider_secrets WHERE name=?")
        .get(name);
    },
  };
}
export function providerBase(value) {
  const url = new URL(value);
  const host = url.hostname,
    local =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(url.protocol === "https:" || (url.protocol === "http:" && local))
  )
    throw Error(
      "Use o endereço base HTTPS do provedor, ou HTTP na rede local.",
    );
  return url.origin;
}
export function phone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 16);
}
export function redact(value) {
  return String(value)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, "[TELEFONE]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[DOCUMENTO]");
}
