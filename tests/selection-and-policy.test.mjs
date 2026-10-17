import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { selectionLimit } from "../src/stockLimits.ts";
const { isAllowedApiRequest } = createRequire(import.meta.url)(
  "../shared/api-policy.cjs",
);
test("desktop permite endereços, CEP e relatórios e mantém bloqueio de navegação externa/travessia", () => {
  for (const path of [
    "/delivery-areas",
    "/address/cep/01001000",
    "/admin/delivery-areas",
    "/admin/reports?from=2026-10-16",
    "/staff/orders",
    "/admin/catalog/import",
  ])
    assert.equal(isAllowedApiRequest(path, "GET"), true, path);
  for (const path of [
    "https://evil.test",
    "/unknown",
    "/admin/../secret",
    "/admin/%2e%2e/secret",
    "/admin/\\secret",
    "/catalogue",
    "/admin/file#test",
    "/admin/a\n",
  ])
    assert.equal(isAllowedApiRequest(path), false, path);
  assert.equal(isAllowedApiRequest("/admin/store", "CONNECT"), false);
});
test("seleção desconta outras linhas do mesmo produto e trava em zero ou no teto por linha", () => {
  assert.equal(selectionLimit(3), 3);
  assert.equal(selectionLimit(3, 2), 1);
  assert.equal(selectionLimit(3, 3), 0);
  assert.equal(selectionLimit(3, 4), 0);
  assert.equal(selectionLimit(0), 0);
  assert.equal(selectionLimit(null), 20);
  assert.equal(selectionLimit(50), 20);
});
