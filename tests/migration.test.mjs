import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, readOrder } from "../server/database.mjs";

test("atualização preserva pedidos, sessões e impressora do banco 0.1", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pronto-migration-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let db = openDatabase(directory);
  // Reconstrói as colunas da versão 0.1, com dados reais anteriores à migração.
  for (const [table, columns] of [
    [
      "orders",
      ["source", "table_name", "pickup_code", "actor_name", "accepted_at"],
    ],
    ["order_items", ["category"]],
    ["print_targets", ["options"]],
    ["sessions", ["role", "actor_name"]],
  ])
    for (const column of columns)
      db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  db.exec("DROP TABLE categories");
  db.prepare(
    "INSERT INTO orders(id,idempotency_key,request_hash,tracking_token,customer_name,phone,fulfillment,address,payment,notes,subtotal,delivery_fee,total,status,created_at,updated_at) VALUES ('antigo','chave-antiga','hash-antigo','token-antigo','Cliente antigo','11999999999','pickup','','card','Sem sal',2490,0,2490,'new',?,?)",
  ).run(new Date().toISOString(), new Date().toISOString());
  db.prepare(
    "INSERT INTO order_items(id,order_id,product_id,name,price,quantity,notes,station) VALUES ('linha','antigo','brasa-classico','Nome antigo',2490,1,'Sem cebola','Cozinha')",
  ).run();
  db.prepare(
    "UPDATE print_targets SET device_name='ELGIN i8 USB' WHERE id='geral'",
  ).run();
  db.prepare(
    "INSERT INTO sessions(token_hash,expires_at) VALUES ('sessao-antiga',?)",
  ).run(Date.now() + 60000);
  db.close();
  db = openDatabase(directory);
  const order = readOrder(db, "antigo");
  assert.equal(order.customerName, "Cliente antigo");
  assert.equal(order.items[0].name, "Nome antigo");
  assert.equal(order.items[0].notes, "Sem cebola");
  assert.equal(order.source, "menu");
  assert.equal(order.status, "new");
  assert.equal(order.acceptedAt, null);
  assert.equal(
    db.prepare("SELECT device_name FROM print_targets WHERE id='geral'").get()
      .device_name,
    "ELGIN i8 USB",
  );
  assert.equal(
    db
      .prepare("SELECT role FROM sessions WHERE token_hash='sessao-antiga'")
      .get().role,
    "admin",
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM categories").get().n, 3);
  db.prepare("UPDATE categories SET sort=-1 WHERE name='Bebidas'").run();
  db.close();
  db = openDatabase(directory);
  assert.equal(
    db.prepare("SELECT name FROM categories ORDER BY sort LIMIT 1").get().name,
    "Bebidas",
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 1);
  db.close();
});
