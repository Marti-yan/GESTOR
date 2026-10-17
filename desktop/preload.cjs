const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "prontoDesktop",
  Object.freeze({
    api: (path, method = "GET", body, headers) =>
      ipcRenderer.invoke("pronto:api", { path, method, body, headers }),
    info: () => ipcRenderer.invoke("pronto:info"),
    precific: (request) => ipcRenderer.invoke('pronto:precific',request),
    printers: () => ipcRenderer.invoke("pronto:printers"),
    configure: (config) => ipcRenderer.invoke("pronto:configure", config),
    testPrint: (target, targets) =>
      ipcRenderer.invoke("pronto:test-print", { target, targets }),
    openMenu: () => ipcRenderer.invoke("pronto:open-menu"),
    checkUpdate: () => ipcRenderer.invoke("pronto:check-update"),
    downloadUpdate: () => ipcRenderer.invoke("pronto:download-update"),
    installUpdate: () => ipcRenderer.invoke("pronto:install-update"),
    previewReceipt: (orderId) =>
      ipcRenderer.invoke("pronto:preview-receipt", orderId),
  }),
);
