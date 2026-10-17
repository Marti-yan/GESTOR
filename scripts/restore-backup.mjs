import { randomUUID } from "node:crypto";
// Offline only. Never replace a live database or replay old print/outbox work.
import { DatabaseSync } from "node:sqlite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  renameSync,
} from "node:fs";
import { resolve, join } from "node:path";
const [sourcePath, targetDir, confirmation] = process.argv.slice(2);
if (!sourcePath || !targetDir || confirmation !== "--gestor-fechado")
  throw Error(
    "Feche o gestor e execute: node scripts/restore-backup.mjs BACKUP.sqlite PASTA_DADOS --gestor-fechado",
  );
const source = resolve(sourcePath),
  directory = resolve(targetDir),
  destination = join(directory, "pronto.sqlite");
if (
  source === destination ||
  existsSync(destination + "-wal") ||
  existsSync(destination + "-shm")
)
  throw Error(
    "O banco está aberto ou tem arquivos WAL. Encerre o gestor e confira a pasta antes de restaurar.",
  );
const original = new DatabaseSync(source, { readOnly: true });
try {
  if (original.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw Error("Backup inválido.");
  if (
    !original
      .prepare("SELECT name FROM sqlite_master WHERE name='orders'")
      .get()
  )
    throw Error("Este arquivo não é um banco Pronto.");
} finally {
  original.close();
}
mkdirSync(directory, { recursive: true });
const staging = join(directory, "restauracao-" + Date.now() + ".sqlite");
copyFileSync(source, staging);
const restored = new DatabaseSync(staging);
try {
  restored.exec("BEGIN IMMEDIATE");
  const table = (name) =>
    Boolean(
      restored.prepare("SELECT name FROM sqlite_master WHERE name=?").get(name),
    );
  if (table("print_jobs"))
    restored.exec(
      "UPDATE print_jobs SET state='uncertain',claim_token=NULL,agent_id=NULL,lease_until=NULL,last_error='Backup restaurado. Reimprima apenas após conferir a cozinha.' WHERE state IN ('pending','claimed','printing','uncertain')",
    );
  if (table("chat_outbox"))
    restored.exec(
      "UPDATE chat_outbox SET state='failed',error='Backup restaurado. Confira a conversa antes de reenviar.' WHERE state IN ('pending','sending')",
    );
  if (table("ai_jobs"))
    restored.exec(
      "UPDATE ai_jobs SET state='failed',error='Backup restaurado' WHERE state IN ('pending','running')",
    );
  if (table("chat_campaigns"))
    restored.exec(
      "UPDATE chat_campaigns SET status='paused' WHERE status='running'",
    );
  if (table("chat_tickets"))
    restored.exec("UPDATE chat_tickets SET agent_mode='paused'");
  if (table("courier_sharing")) restored.exec("DELETE FROM courier_sharing");
  if (table("courier_positions"))
    restored.exec("UPDATE courier_positions SET sharing=0");
  restored
    .prepare(
      "INSERT INTO settings VALUES ('courier-epoch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(JSON.stringify(randomUUID()));
  if (table("sessions")) restored.exec("DELETE FROM sessions");
  restored.exec("COMMIT");
} catch (e) {
  restored.exec("ROLLBACK");
  throw e;
} finally {
  restored.close();
}
if (existsSync(destination))
  copyFileSync(
    destination,
    join(directory, "antes-da-restauracao-" + Date.now() + ".sqlite"),
  );
renameSync(staging, destination);
console.log(
  "Backup restaurado. Filas antigas e sessões foram desativadas; entre no gestor e confira pedidos e integrações.",
);
