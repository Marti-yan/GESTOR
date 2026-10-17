const { mkdir, open, rename, rm, stat } = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const { createHash, randomUUID } = require("node:crypto");
const { join } = require("node:path");
const CHANNELS = ["main", "master"].map(
  (branch) =>
    `https://raw.githubusercontent.com/Marti-yan/GESTOR/${branch}/updates/windows.json`,
);
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function compareVersions(a, b) {
  if (!VERSION.test(a) || !VERSION.test(b))
    throw new Error("Versão de atualização inválida.");
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
function validateManifest(input) {
  if (
    !input ||
    !VERSION.test(input.version) ||
    !VERSION.test(input.minVersion || "0.2.0") ||
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    !Number.isSafeInteger(input.size) ||
    input.size < 51200 ||
    input.size > 50 * 1024 * 1024
  )
    throw new Error("O manifesto de atualização está incompleto ou inválido.");
  const url = new URL(input.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "raw.githubusercontent.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !new RegExp(
      `^/Marti-yan/GESTOR/[a-f0-9]{40}/Reparar-Pronto-${input.version.replaceAll(".", "\\.")}\\.exe$`,
    ).test(url.pathname)
  )
    throw new Error(
      "A atualização precisa apontar para um executável versionado do repositório oficial.",
    );
  return {
    version: input.version,
    minVersion: input.minVersion || "0.2.0",
    url: url.href,
    sha256: input.sha256,
    size: input.size,
    notes: (Array.isArray(input.notes) ? input.notes : [])
      .filter((v) => typeof v === "string")
      .slice(0, 12)
      .map((v) => v.slice(0, 240)),
  };
}
class LocalUpdater {
  constructor({ currentVersion, directory, fetchImpl = fetch }) {
    this.currentVersion = currentVersion;
    this.directory = directory;
    this.fetch = fetchImpl;
    this.state = { stage: "idle", currentVersion, progress: 0 };
    this.manifest = null;
    this.file = null;
  }
  snapshot() {
    return structuredClone(this.state);
  }
  async check() {
    if (["checking", "downloading"].includes(this.state.stage))
      return this.snapshot();
    this.state = {
      stage: "checking",
      currentVersion: this.currentVersion,
      progress: 0,
    };
    try {
      let response;
      for (const channel of CHANNELS) {
        response = await this.fetch(channel, {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
        if (response.status !== 404) break;
      }
      if (!response?.ok)
        throw new Error(
          "Não foi possível consultar a versão publicada. Confira a internet e tente novamente.",
        );
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 65536)
          throw new Error("Manifesto de atualização muito grande.");
        chunks.push(Buffer.from(chunk));
      }
      const manifest = validateManifest(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      this.manifest = manifest;
      this.file = null;
      this.state = {
        stage:
          compareVersions(manifest.version, this.currentVersion) <= 0
            ? "upToDate"
            : compareVersions(this.currentVersion, manifest.minVersion) < 0
              ? "incompatible"
              : "available",
        currentVersion: this.currentVersion,
        version: manifest.version,
        size: manifest.size,
        notes: manifest.notes,
        progress: 0,
      };
    } catch (e) {
      this.state = {
        stage: "error",
        currentVersion: this.currentVersion,
        progress: 0,
        error: e.message,
      };
    }
    return this.snapshot();
  }
  async startDownload() {
    if (this.state.stage === "downloading") return this.snapshot();
    if (this.state.stage !== "available" || !this.manifest)
      throw new Error("Consulte a atualização antes de baixar.");
    const manifest = { ...this.manifest };
    this.state = {
      ...this.state,
      stage: "downloading",
      progress: 0,
      error: undefined,
    };
    this.pending = this.download(manifest).catch((e) => {
      this.state = { ...this.state, stage: "error", error: e.message };
    });
    return this.snapshot();
  }
  async download(manifest) {
    await mkdir(this.directory, { recursive: true });
    const temp = join(this.directory, randomUUID() + ".download"),
      dest = join(this.directory, `Reparar-Pronto-${manifest.version}.exe`);
    let handle;
    try {
      const response = await this.fetch(manifest.url, {
        signal: AbortSignal.timeout(120000),
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(
          "Não foi possível baixar o instalador. Tente novamente.",
        );
      handle = await open(temp, "wx", 0o600);
      const hash = createHash("sha256");
      let received = 0;
      for await (const value of response.body) {
        const chunk = Buffer.from(value);
        received += chunk.length;
        if (received > manifest.size)
          throw new Error("O instalador recebido excede o tamanho publicado.");
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) {
          const { bytesWritten } = await handle.write(
            chunk,
            offset,
            chunk.length - offset,
          );
          if (!bytesWritten)
            throw new Error("Não foi possível salvar o instalador.");
          offset += bytesWritten;
        }
        this.state = {
          ...this.state,
          progress: Math.min(99, Math.round((received / manifest.size) * 100)),
        };
      }
      await handle.sync();
      await handle.close();
      handle = null;
      if (received !== manifest.size || hash.digest("hex") !== manifest.sha256)
        throw new Error(
          "O instalador está incompleto ou não corresponde ao SHA-256 publicado. Nada foi instalado.",
        );
      await rm(dest, { force: true });
      await rename(temp, dest);
      this.file = dest;
      await this.verify();
      this.state = { ...this.state, stage: "ready", progress: 100 };
    } finally {
      if (handle) await handle.close();
      await rm(temp, { force: true });
    }
  }
  async verify() {
    if (!this.file || !this.manifest)
      throw new Error("Baixe e verifique a atualização primeiro.");
    const info = await stat(this.file);
    if (info.size !== this.manifest.size)
      throw new Error("O instalador foi alterado. Baixe novamente.");
    const hash = createHash("sha256");
    let first = true;
    for await (const chunk of createReadStream(this.file)) {
      if (first) {
        first = false;
        if (chunk.subarray(0, 2).toString() !== "MZ")
          throw new Error("O download não é um executável Windows.");
      }
      hash.update(chunk);
    }
    if (hash.digest("hex") !== this.manifest.sha256)
      throw new Error("O instalador foi alterado. Baixe novamente.");
    return this.file;
  }
}
module.exports = { LocalUpdater, validateManifest, compareVersions, CHANNELS };
