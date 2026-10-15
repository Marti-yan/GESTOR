const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "prontoDesktop",
  Object.freeze({
    api: (path, method = "GET", body, headers) =>
      ipcRenderer.invoke("pronto:api", { path, method, body, headers }),
    info: () => ipcRenderer.invoke("pronto:info"),
    printers: () => ipcRenderer.invoke("pronto:printers"),
    configure: (config) => ipcRenderer.invoke("pronto:configure", config),
    testPrint: (target) => ipcRenderer.invoke("pronto:test-print", target),
    openMenu: () => ipcRenderer.invoke("pronto:open-menu"),
    previewReceipt: (orderId) =>
      ipcRenderer.invoke("pronto:preview-receipt", orderId),
  }),
);
