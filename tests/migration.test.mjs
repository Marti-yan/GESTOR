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

test("migração da 0.2 preserva a fila existente e numera as vias sem reimprimir", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pronto-v2-migration-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let db = openDatabase(directory);
  db.prepare("DELETE FROM print_targets WHERE id IN ('batata','balcao')").run();
  db.prepare("DELETE FROM settings WHERE key='printing-templates-v3'").run();
  for (const [table, columns] of [
    ["orders", ["counter_requested"]],
    ["products", ["modifier_group_ids"]],
    ["order_items", ["base_price", "modifiers"]],
    ["print_targets", ["location", "filter"]],
    [
      "print_jobs",
      [
        "batch_id",
        "batch_index",
        "batch_count",
        "target_snapshot",
        "purpose",
        "late_extra",
      ],
    ],
  ])
    for (const column of columns)
      db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  db.exec("DROP TABLE modifier_groups");
  const stamp = new Date().toISOString();
  db.prepare(
    "INSERT INTO orders(id,idempotency_key,request_hash,tracking_token,customer_name,phone,fulfillment,address,payment,notes,subtotal,delivery_fee,total,status,created_at,updated_at,source) VALUES ('legado-v2','chave-v2','hash-v2','token-v2','Cliente legado','','pickup','','card','',2490,0,2490,'preparing',?,?,'menu')",
  ).run(stamp, stamp);
  db.prepare(
    "INSERT INTO order_items(id,order_id,product_id,name,price,quantity,notes,station,category) VALUES ('item-v2','legado-v2','brasa-classico','Lanche antigo',2490,1,'Sem cebola','Cozinha','Burgers')",
  ).run();
  db.prepare(
    "UPDATE print_targets SET device_name='Elgin USB' WHERE id='geral'",
  ).run();
  db.prepare(
    "INSERT INTO print_targets(id,label,device_name,width,station,enabled,options) VALUES ('cozinha-antiga','Cozinha antiga','Elgin USB',80,'Cozinha',1,'{}')",
  ).run();
  const insert = db.prepare(
    "INSERT INTO print_jobs(id,order_id,target_id,state,created_at,updated_at) VALUES (?,'legado-v2',?,?,?,?)",
  );
  insert.run("via-v2-1", "geral", "pending", stamp, stamp);
  insert.run("via-v2-2", "cozinha-antiga", "spooled", stamp, stamp);
  db.close();
  db = openDatabase(directory);
  const order = readOrder(db, "legado-v2");
  assert.equal(order.total, 2490);
  assert.equal(order.items[0].basePrice, 2490);
  assert.deepEqual(order.items[0].modifiers, []);
  assert.deepEqual(
    order.printJobs.map((j) => [j.state, j.receiptIndex, j.receiptCount]),
    [
      ["pending", 1, 2],
      ["spooled", 2, 2],
    ],
  );
  db.prepare("UPDATE print_targets SET options=? WHERE id='batata'").run(
    JSON.stringify({ preset: "minimal", lineGapMm: 2.5 }),
  );
  db.close();
  db = openDatabase(directory);
  assert.equal(
    JSON.parse(
      db.prepare("SELECT options FROM print_targets WHERE id='batata'").get()
        .options,
    ).lineGapMm,
    2.5,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM print_jobs").get().n, 2);
  db.close();
});

test("migração recalcula somente vias de cozinha sem reimprimir e preserva configurações", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pronto-v4-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let db = openDatabase(directory);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO orders(id,idempotency_key,request_hash,tracking_token,customer_name,phone,fulfillment,address,payment,notes,subtotal,delivery_fee,total,status,created_at,updated_at) VALUES ('v4','v4','v4','v4','Cliente','','pickup','','card','',100,0,100,'preparing',?,?)",
  ).run(now, now);
  for (const [index, target, purpose, state] of [
    [1, "geral", "production", "spooled"],
    [2, "batata", "production", "pending"],
    [3, "balcao", "counter", "pending"],
  ])
    db.prepare(
      "INSERT INTO print_jobs(id,order_id,target_id,state,created_at,updated_at,batch_count,batch_index,purpose) VALUES (?,'v4',?,?,?,?,3,?,?)",
    ).run("j" + index, target, state, now, now, index, purpose);
  db.prepare("UPDATE print_targets SET options=? WHERE id='geral'").run(
    JSON.stringify({
      lineGapMm: 2,
      categoryHighlights: [{ category: "Bebidas", style: "box" }],
    }),
  );
  db.prepare("DELETE FROM settings WHERE key='print-count-kitchen-v5'").run();
  db.close();
  db = openDatabase(directory);
  const jobs = readOrder(db, "v4").printJobs;
  assert.deepEqual(
    jobs.map((j) => [j.receiptIndex, j.receiptCount]),
    [
      [1, 2],
      [2, 2],
      [0, 2],
    ],
  );
  assert.equal(jobs[0].state, "spooled");
  assert.equal(jobs.length, 3);
  assert.equal(
    JSON.parse(
      db.prepare("SELECT options FROM print_targets WHERE id='geral'").get()
        .options,
    ).lineGapMm,
    2,
  );
  db.close();
});
