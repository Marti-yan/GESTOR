import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
const { LocalUpdater, validateManifest, compareVersions } = createRequire(
  import.meta.url,
)("../desktop/updater.cjs");
const binary = Buffer.alloc(70000, 0x30);
binary.write("MZ");
const manifest = {
  version: "0.4.0",
  minVersion: "0.2.0",
  url:
    "https://raw.githubusercontent.com/Marti-yan/GESTOR/" +
    "a".repeat(40) +
    "/Reparar-Pronto-0.4.0.exe",
  size: binary.length,
  sha256: createHash("sha256").update(binary).digest("hex"),
  notes: ["Correções de impressão"],
};
function fixture(t, impl) {
  const directory = mkdtempSync(join(tmpdir(), "pronto-updater-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return new LocalUpdater({
    currentVersion: "0.3.0",
    directory,
    fetchImpl: impl,
  });
}

test("atualizador usa main, só tenta master em 404 e compara versões numericamente", async (t) => {
  const paths = [];
  const updater = fixture(t, async (url) => {
    paths.push(url);
    return url.includes("/main/")
      ? new Response("", { status: 404 })
      : new Response(JSON.stringify(manifest));
  });
  assert.equal((await updater.check()).stage, "available");
  assert.equal(paths.length, 2);
  assert.ok(paths[1].includes("/master/"));
  assert.equal(compareVersions("0.10.0", "0.9.0"), 1);
  assert.throws(() =>
    validateManifest({ ...manifest, url: "https://outro.example/arquivo.exe" }),
  );
  assert.throws(() =>
    validateManifest({
      ...manifest,
      url: manifest.url.replace("a".repeat(40), "main"),
    }),
  );
  assert.throws(() => validateManifest({ ...manifest, size: 0 }));
});

test("download verifica tamanho e hash, e revalida antes de instalar", async (t) => {
  const updater = fixture(
    t,
    async (url) =>
      new Response(url.endsWith(".json") ? JSON.stringify(manifest) : binary),
  );
  await updater.check();
  await updater.startDownload();
  await updater.pending;
  assert.equal(updater.snapshot().stage, "ready");
  assert.equal(updater.snapshot().progress, 100);
  const file = await updater.verify();
  const corrupted=Buffer.alloc(binary.length);corrupted.write('MZ');writeFileSync(file,corrupted);
  await assert.rejects(updater.verify(), /alterado/);
});

test("download adulterado não fica pronto e atualização antiga não é oferecida", async (t) => {
  const updater = fixture(
    t,
    async (url) =>
      new Response(
        url.endsWith(".json")
          ? JSON.stringify(manifest)
          : Buffer.alloc(binary.length),
      ),
  );
  await updater.check();
  await updater.startDownload();
  await updater.pending;
  assert.equal(updater.snapshot().stage, "error");
  assert.match(updater.snapshot().error, /SHA-256/);
  assert.equal(updater.file, null);
  const current = fixture(
    t,
    async () =>
      new Response(
        JSON.stringify({
          ...manifest,
          version: "0.3.0",
          url: manifest.url.replaceAll("0.4.0", "0.3.0"),
        }),
      ),
  );
  assert.equal((await current.check()).stage, "upToDate");
});
