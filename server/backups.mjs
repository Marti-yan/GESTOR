import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, statSync, rmSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
export function installBackups({ app, db, admin, wrap, fail, dataDir }) {
  const directory = join(dataDir, "backups"),
    pattern = /^pronto-\d{4}-\d{2}-\d{2}-[a-f0-9]+\.sqlite$/;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const list = () =>
    readdirSync(directory)
      .filter((n) => pattern.test(n))
      .map((name) => {
        const file = statSync(join(directory, name));
        return { name, size: file.size, createdAt: file.mtime.toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const create = () => {
    const name = `pronto-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(16)}${randomBytes(4).toString("hex")}.sqlite`,
      path = join(directory, name);
    try {
      db.prepare("VACUUM INTO ?").run(path);
      chmodSync(path, 0o600);
      const snapshot = new DatabaseSync(path, { readOnly: true });
      try {
        if (
          snapshot.prepare("PRAGMA integrity_check").get().integrity_check !==
          "ok"
        )
          fail(500, "O backup não passou na verificação de integridade.");
      } finally {
        snapshot.close();
      }
      for (const old of list().slice(7)) rmSync(join(directory, old.name));
      return name;
    } catch (e) {
      rmSync(path, { force: true });
      throw e;
    }
  };
  let startupError = "";
  try {
    if (
      !list().some((f) =>
        f.name.startsWith(`pronto-${new Date().toISOString().slice(0, 10)}-`),
      )
    )
      create();
  } catch {
    startupError =
      "O backup automático não pôde ser criado. Verifique o espaço e as permissões da pasta de dados.";
  }
  app.get(
    "/api/admin/backups",
    admin,
    wrap((_req, res) =>
      res.json({ files: list(), directory, error: startupError, retention: 7 }),
    ),
  );
  app.post(
    "/api/admin/backups",
    admin,
    wrap((_req, res) => {
      const name = create();
      startupError = "";
      res.status(201).json({ name, verified: true });
    }),
  );
}
