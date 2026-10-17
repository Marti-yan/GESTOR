import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApplication } from "../server/app.mjs";
import { readStore } from "../server/database.mjs";
test("HTTP entrega itens em HTML antes do JavaScript; JSON público é escapado e separado das rotas privadas", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pronto-ssr-")),
    web = join(dir, "web");
  mkdirSync(web);
  await build({
    entryPoints: ["src/menu-ssr.tsx"],
    outfile: join(dir, "menu-ssr.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "empty" },
  });
  writeFileSync(
    join(web, "index.html"),
    '<!doctype html><html lang="pt-BR"><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>',
  );
  const { app, db, communications } = createApplication({
    dataDir: join(dir, "data"),
    webDir: web,
    adminPassword: "senha-de-teste-para-ssr",
  });
  const store = readStore(db);
  store.name = 'Loja </script><img src=x onerror="alert(1)">';
  db.prepare("UPDATE settings SET value=? WHERE key='store'").run(
    JSON.stringify(store),
  );
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  t.after(async () => {
    await communications.stop();
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const response = await fetch(base + "/"),
    html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(html, /Brasa Clássico/);
  assert.match(html, /Bebidas/);
  assert.doesNotMatch(html, /Carregando o cardápio/);
  const json = html.match(
    /<script id="pronto-catalog" type="application\/json">([\s\S]*?)<\/script>/,
  )[1];
  assert.equal(JSON.parse(json).store.name, store.name);
  assert.doesNotMatch(json, /<\/script/);
  assert.doesNotMatch(html, /<img src=x/);
  const waiter = await (await fetch(base + "/garcom")).text();
  assert.doesNotMatch(waiter, /Brasa Clássico/);
  assert.doesNotMatch(waiter, /pronto-catalog/);
});
