const {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  Tray,
  Menu,
  nativeImage,
  dialog,
  shell,
} = require("electron");
const { spawn } = require("node:child_process");
const {
  readFileSync,
  existsSync,
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
} = require("node:fs");
const { join, resolve } = require("node:path");
const { randomBytes, randomUUID, createHash } = require("node:crypto");
const { networkInterfaces } = require("node:os");
const net = require("node:net");
const { PrintAgent } = require("./print-agent.cjs");
const { renderReceipt, testOrder } = require("../shared/receipt.cjs");

let mainWindow,
  tray,
  serverProcess,
  localServerUrl,
  bootstrapToken,
  config = {},
  sessionToken = "",
  printAgent,
  printerError = null,
  lastSync = null,
  quitting = false,
  timer;
const agentId = randomUUID();
function atomicJson(file, value) {
  mkdirSync(require("node:path").dirname(file), { recursive: true });
  const temporary = file + ".tmp";
  const fd = openSync(temporary, "w", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, file);
}
function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function configPath() {
  return join(app.getPath("userData"), "connection.json");
}
function saveConfig() {
  const stored = { ...config };
  delete stored.encryptedToken;
  if (sessionToken && safeStorage.isEncryptionAvailable())
    stored.encryptedToken = safeStorage
      .encryptString(sessionToken)
      .toString("base64");
  atomicJson(configPath(), stored);
}
function readConfig() {
  config = readJson(configPath(), { autoPrint: false });
  if (config.encryptedToken && safeStorage.isEncryptionAvailable()) {
    try {
      sessionToken = safeStorage.decryptString(
        Buffer.from(config.encryptedToken, "base64"),
      );
    } catch {
      sessionToken = "";
    }
  }
}
function validateServer(value) {
  const url = new URL(String(value));
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "Use apenas o endereço base do servidor, sem usuário, caminho ou parâmetros.",
    );
  const hostname = url.hostname,
    privateHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith(".local");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && privateHost))
    throw new Error(
      "Use HTTPS para servidores externos. HTTP é permitido apenas na rede local.",
    );
  return url.origin;
}
async function requestApi(path, method = "GET", body, extraHeaders = {}) {
  if (
    typeof path !== "string" ||
    !/^\/(?:auth|catalog|admin|orders|track|health)(?:\/|$)/.test(path) ||
    path.includes("..") ||
    path.includes("://") ||
    !["GET", "POST", "PUT", "PATCH"].includes(method)
  )
    throw new Error("Operação não permitida.");
  const headers = {
    "Content-Type": "application/json",
    "X-Pronto-Desktop": "1",
    ...extraHeaders,
  };
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
  if (path === "/auth/setup" && config.serverUrl === localServerUrl)
    headers["X-Pronto-Bootstrap"] = bootstrapToken;
  const response = await fetch(config.serverUrl + "/api" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  const data = await response
    .json()
    .catch(() => ({ error: "O servidor não retornou os dados esperados." }));
  if (!response.ok) {
    const error = new Error(
      data.error || "Não foi possível conectar ao servidor.",
    );
    error.status = response.status;
    throw error;
  }
  if (data.desktopToken) {
    sessionToken = data.desktopToken;
    saveConfig();
    delete data.desktopToken;
  }
  if (path === "/auth/logout") {
    sessionToken = "";
    saveConfig();
    config.autoPrint = false;
    saveConfig();
  }
  lastSync = new Date().toISOString();
  return data;
}
function createAgent() {
  const journalFile = join(
    app.getPath("userData"),
    "printing",
    createHash("sha256").update(config.serverUrl).digest("hex").slice(0, 20) +
      ".json",
  );
  printAgent = new PrintAgent({
    api: (path, method, body) => requestApi(path, method, { ...body, agentId }),
    print: (job) =>
      printHtml(
        renderReceipt(job.order, job.store, job.target, {
          reprint: job.reprint,
        }),
        job.target,
      ),
    loadJournal: () => readJson(journalFile, {}),
    saveJournal: (journal) => atomicJson(journalFile, journal),
    onError: (message) => {
      printerError = message;
    },
  });
}
async function printHtml(html, target) {
  if (
    !target ||
    ![58, 80].includes(target.width) ||
    typeof target.deviceName !== "string" ||
    !target.deviceName
  )
    throw new Error("Selecione uma impressora do Windows.");
  const printers = await mainWindow.webContents.getPrintersAsync();
  if (!printers.some((p) => p.name === target.deviceName))
    throw new Error(
      `A impressora “${target.deviceName}” não está disponível neste computador.`,
    );
  const window = new BrowserWindow({
    show: false,
    width: 500,
    height: 800,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  try {
    const secureHtml = html.replace(
      "<head>",
      "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'\">",
    );
    await window.loadURL(
      "data:text/html;charset=utf-8," + encodeURIComponent(secureHtml),
    );
    const height = await window.webContents.executeJavaScript(
      "Math.ceil(document.body.getBoundingClientRect().height)",
    );
    await new Promise((resolve, reject) => {
      let finished = false;
      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true;
          const error = new Error(
            "A impressora não respondeu a tempo. Confira o papel antes de reenviar.",
          );
          error.uncertain = true;
          reject(error);
        }
      }, 60000);
      window.webContents.print(
        {
          silent: true,
          deviceName: target.deviceName,
          printBackground: true,
          color: false,
          copies: 1,
          margins: { marginType: "none" },
          pageSize: {
            width: target.width * 1000,
            height: Math.max(
              50000,
              Math.min(2000000, Math.ceil((height * 25400) / 96) + 8000),
            ),
          },
        },
        (success, reason) => {
          clearTimeout(timeout);
          if (finished) return;
          finished = true;
          if (success) {
            printerError = null;
            resolve();
          } else
            reject(
              new Error(
                `Falha de impressão: ${reason || "confira o driver e a conexão USB"}`,
              ),
            );
        },
      );
    });
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}
function menuUrl() {
  if (config.serverUrl !== localServerUrl) return config.serverUrl;
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal);
  const address =
    addresses.find((a) =>
      /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(a.address),
    ) || addresses[0];
  return address
    ? `http://${address.address}:${new URL(localServerUrl).port}`
    : localServerUrl;
}
function info() {
  return {
    version: app.getVersion(),
    serverUrl: config.serverUrl,
    localServerUrl,
    menuUrl: menuUrl(),
    autoPrint: Boolean(config.autoPrint),
    connected: Boolean(lastSync && Date.now() - Date.parse(lastSync) < 20000),
    printerError,
    lastSync,
    hasToken: Boolean(sessionToken),
  };
}
function assertSender(event) {
  const url = new URL(event.senderFrame.url);
  if (url.origin !== localServerUrl) throw new Error("Origem não autorizada.");
}
function registerIpc() {
  ipcMain.handle(
    "pronto:api",
    async (event, { path, method = "GET", body, headers = {} }) => {
      assertSender(event);
      const allowed = {};
      if (typeof headers["Idempotency-Key"] === "string")
        allowed["Idempotency-Key"] = headers["Idempotency-Key"];
      return requestApi(path, method, body, allowed);
    },
  );
  ipcMain.handle("pronto:info", (event) => {
    assertSender(event);
    return info();
  });
  ipcMain.handle("pronto:printers", async (event) => {
    assertSender(event);
    return (await mainWindow.webContents.getPrintersAsync()).map((p) => ({
      name: p.name,
      displayName: p.displayName,
      isDefault: p.isDefault,
      status: p.status,
    }));
  });
  ipcMain.handle("pronto:configure", async (event, value) => {
    assertSender(event);
    if (typeof value.autoPrint === "boolean")
      config.autoPrint = value.autoPrint;
    if (value.serverUrl) {
      const url = validateServer(value.serverUrl);
      if (url !== config.serverUrl) {
        if (printAgent.busy)
          throw new Error(
            "Aguarde a impressão atual terminar para trocar de servidor.",
          );
        config.serverUrl = url;
        config.autoPrint = false;
        sessionToken = "";
        lastSync = null;
        printerError = null;
        createAgent();
      }
    }
    saveConfig();
    return info();
  });
  ipcMain.handle("pronto:test-print", async (event, target) => {
    assertSender(event);
    if (!sessionToken) throw new Error("Entre no gestor primeiro.");
    if (printAgent.busy) throw new Error("Aguarde a comanda atual terminar.");
    const { store } = await requestApi("/catalog");
    await printHtml(
      renderReceipt(testOrder(), store, target, { test: true }),
      target,
    );
    return { ok: true };
  });
  ipcMain.handle("pronto:open-menu", async (event) => {
    assertSender(event);
    await shell.openExternal(menuUrl());
  });
  ipcMain.handle("pronto:preview-receipt", async (event, id) => {
    assertSender(event);
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(id))
      throw new Error("Pedido inválido.");
    const { orders, store } = await requestApi("/admin/orders");
    const order = orders.find((o) => o.id === id);
    if (!order) throw new Error("Pedido não encontrado.");
    const preview = new BrowserWindow({
      width: 420,
      height: 800,
      title: "Comanda — visualização",
      parent: mainWindow,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    preview.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    await preview.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          renderReceipt(order, store, {
            width: 80,
            label: "Visualização — comanda geral",
            station: "*",
          }),
        ),
    );
  });
}
function availablePort(start) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error) =>
      error.code === "EADDRINUSE" && start < 4330
        ? availablePort(start + 1).then(resolve, reject)
        : reject(error),
    );
    server.listen(start, "0.0.0.0", () => server.close(() => resolve(start)));
  });
}
async function startLocalServer() {
  const port = await availablePort(4317);
  localServerUrl = `http://127.0.0.1:${port}`;
  bootstrapToken = randomBytes(32).toString("hex");
  const root = app.isPackaged
    ? process.resourcesPath
    : resolve(__dirname, "..");
  const executable = app.isPackaged
    ? join(root, "node.exe")
    : process.env.PRONTO_NODE_BINARY || "node";
  const entry = app.isPackaged
    ? join(root, "server-bundle.cjs")
    : join(root, "server", "index.mjs");
  serverProcess = spawn(executable, [entry], {
    windowsHide: true,
    cwd: root,
    env: {
      ...process.env,
      HOST: "0.0.0.0",
      PORT: String(port),
      DATA_DIR: join(app.getPath("userData"), "database"),
      PRONTO_WEB_DIR: join(root, app.isPackaged ? "web" : "dist"),
      PRONTO_BOOTSTRAP_TOKEN: bootstrapToken,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let exited = false,
    log = "";
  serverProcess.once("error", (error) => {
    exited = true;
    log = error.message;
  });
  serverProcess.once("exit", () => {
    exited = true;
  });
  serverProcess.stderr.on("data", (chunk) => {
    log = (log + chunk).slice(-2500);
  });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (exited) throw new Error("O servidor local não iniciou. " + log);
    try {
      const response = await fetch(localServerUrl + "/api/health", {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    "O servidor local demorou para iniciar. Reinicie o aplicativo.",
  );
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: "Pronto Gestor",
    backgroundColor: "#f6f7f3",
    icon: join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== localServerUrl) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.on("close", (event) => {
    if (!quitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.loadURL(localServerUrl + "/#/gestor");
  const icon = nativeImage.createFromPath(join(__dirname, "icon.png"));
  tray = new Tray(icon.resize({ width: 20, height: 20 }));
  tray.setToolTip("Pronto Gestor — pedidos e impressão");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Abrir gestor",
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { label: "Abrir cardápio", click: () => shell.openExternal(menuUrl()) },
      { type: "separator" },
      {
        label: "Encerrar Pronto e parar servidor",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => mainWindow.show());
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      readConfig();
      await startLocalServer();
      if (!config.serverUrl) config.serverUrl = localServerUrl;
      // Um endereço antigo do servidor local acompanha uma eventual mudança da porta.
      if (/^http:\/\/127\.0\.0\.1:43\d\d$/.test(config.serverUrl))
        config.serverUrl = localServerUrl;
      saveConfig();
      registerIpc();
      createAgent();
      createWindow();
      timer = setInterval(async () => {
        if (sessionToken && config.autoPrint) {
          await printAgent.tick();
        } else {
          try {
            await requestApi("/health");
          } catch {}
        }
      }, 2000);
    })
    .catch((error) => {
      dialog.showErrorBox("Não foi possível iniciar o Pronto", error.message);
      quitting = true;
      app.quit();
    });
  app.on("before-quit", () => {
    quitting = true;
    clearInterval(timer);
    if (serverProcess) serverProcess.kill();
  });
  app.on("window-all-closed", () => {
    if (quitting) app.quit();
  });
}
