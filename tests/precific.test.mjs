import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
const require = createRequire(import.meta.url);
const {
  PrecificTab,
  PRECIFIC_URL,
  allowedPrecificUrl,
  clampBounds,
} = require("../desktop/precific.cjs");
test("Precific: sessão persiste entre abas, sem preload/Node; links externos e permissões ficam bloqueados", async () => {
  const calls = [];
  let count = 0;
  class View {
    constructor(options) {
      count++;
      this.options = options;
      this.webContents = new EventEmitter();
      Object.assign(this.webContents, {
        loadURL: async (u) => calls.push(["load", u]),
        setWindowOpenHandler: (f) => (this.open = f),
        reloadIgnoringCache: () => calls.push(["reload"]),
        isDestroyed: () => false,
        close: () => calls.push(["close"]),
      });
    }
    setBounds(b) {
      this.bounds = b;
    }
  }
  const permissions = {},
    s = {
      setPermissionRequestHandler: (f) => (permissions.request = f),
      setPermissionCheckHandler: (f) => (permissions.check = f),
    };
  const tab = new PrecificTab({
    window: {
      getContentBounds: () => ({ width: 1200, height: 800 }),
      contentView: {
        addChildView: () => calls.push(["add"]),
        removeChildView: () => calls.push(["remove"]),
      },
    },
    WebContentsView: View,
    session: {
      fromPartition: (key) => {
        assert.equal(key, "persist:pronto-precific");
        return s;
      },
    },
    openExternal: async (u) => calls.push(["external", u]),
  });
  tab.show({ x: 240, y: 180, width: 940, height: 600 });
  const v = tab.view;
  assert.equal(v.options.webPreferences.nodeIntegration, false);
  assert.equal(v.options.webPreferences.contextIsolation, true);
  assert.equal(v.options.webPreferences.sandbox, true);
  assert.equal(v.options.webPreferences.preload, undefined);
  assert.equal(permissions.check(), false);
  tab.hide();
  tab.show({ x: 240, y: 180, width: 940, height: 600 });
  assert.equal(tab.view, v);
  assert.equal(count, 1);
  assert.deepEqual(
    calls.filter((c) => c[0] === "load"),
    [["load", PRECIFIC_URL]],
  );
  let blocked = false;
  v.webContents.emit(
    "will-navigate",
    {
      preventDefault() {
        blocked = true;
      },
    },
    "https://outro.example",
  );
  assert.equal(blocked, true);
  assert.deepEqual(v.open({ url: "file:///etc/passwd" }), { action: "deny" });
  tab.reload();
  await tab.open();
  assert.ok(calls.some((c) => c[0] === "external" && c[1] === PRECIFIC_URL));
  tab.destroy();
  assert.ok(calls.some((c) => c[0] === "close"));
});
test("Precific: origem e limites da janela são validados", () => {
  for (const u of [
    "http://precific.martinscoders.com",
    "https://precific.martinscoders.com.evil.example",
    "https://user@precific.martinscoders.com",
    "javascript:alert(1)",
    "file:///tmp/test",
  ])
    assert.equal(allowedPrecificUrl(u), false, u);
  assert.equal(allowedPrecificUrl(PRECIFIC_URL + "estoque/"), true);
  assert.deepEqual(
    clampBounds(
      { x: -5, y: 700, width: 3000, height: 1000 },
      { width: 1200, height: 800 },
    ),
    { x: 0, y: 700, width: 1200, height: 100 },
  );
  assert.throws(() =>
    clampBounds(
      { x: NaN, y: 0, width: 1, height: 1 },
      { width: 100, height: 100 },
    ),
  );
});
test("Precific: fechar janela destruída não acessa sua área nativa", () => {
  let closed = false;
  const tab = new PrecificTab({
    window: {
      isDestroyed: () => true,
      get contentView() {
        throw Error("Janela destruída");
      },
    },
  });
  tab.attached = true;
  tab.view = {
    webContents: {
      isDestroyed: () => false,
      close() {
        closed = true;
      },
    },
  };
  assert.doesNotThrow(() => tab.destroy());
  assert.equal(closed, true);
  assert.equal(tab.view, null);
});
