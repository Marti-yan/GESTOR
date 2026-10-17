const { spawn } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
function printRaw(
  deviceName,
  data,
  { spawnProcess = spawn, timeoutMs = 60000 } = {},
) {
  if (process.platform !== "win32" && spawnProcess === spawn)
    return Promise.reject(
      new Error("O envio ESC/POS USB é feito pelo gestor Windows."),
    );
  return new Promise((resolve, reject) => {
    const script = readFileSync(join(__dirname, "print-raw.ps1"), "utf8");
    const child = spawnProcess(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "",
      errors = "",
      settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      const e = new Error(
        "A fila de impressão não respondeu. Confira o papel antes de reenviar.",
      );
      e.uncertain = true;
      finish(e);
    }, timeoutMs);
    child.stdout.on(
      "data",
      (chunk) => (output = (output + chunk).slice(-12000)),
    );
    child.stderr.on(
      "data",
      (chunk) => (errors = (errors + chunk).slice(-2000)),
    );
    child.on("error", (error) => finish(error));
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      let result;
      try {
        result = JSON.parse(output.replace(/^\uFEFF/, "").trim());
      } catch {}
      if (code === 0 && result?.ok) return finish(null, result);
      const error = new Error(
        "Impressão ESC/POS: " +
          (result?.error || errors || "o Windows não confirmou o envio."),
      );
      error.uncertain = result?.uncertain !== false;
      finish(error);
    });
    // Dados não são interpolados no comando PowerShell.
    child.stdin.end(
      JSON.stringify({
        printer: deviceName,
        data: Buffer.from(data).toString("base64"),
      }),
    );
  });
}
module.exports = { printRaw };
