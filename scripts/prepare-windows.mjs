import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

// Distribuição oficial do Node: o cliente não precisa instalar Node.js ou Docker.
const version = "v24.19.0",
  directory = ".runtime/windows",
  asset = "win-x64/node.exe";
await mkdir(directory, { recursive: true });
async function download(url) {
  return execFileSync(
    "curl",
    ["--fail", "--location", "--retry", "2", "--silent", "--show-error", url],
    { maxBuffer: 160 * 1024 * 1024 },
  );
}
const sums = (
  await download(`https://nodejs.org/dist/${version}/SHASUMS256.txt`)
).toString();
const line = sums
  .split("\n")
  .find((line) => line.endsWith("  " + asset) || line.endsWith(" " + asset));
if (!line)
  throw new Error("O manifesto oficial não contém o executável Windows.");
const expected = line.split(/\s+/)[0];
let binary;
try {
  binary = await readFile(directory + "/node.exe");
} catch {}
if (!binary || createHash("sha256").update(binary).digest("hex") !== expected) {
  binary = await download(`https://nodejs.org/dist/${version}/${asset}`);
  if (createHash("sha256").update(binary).digest("hex") !== expected)
    throw new Error("Falha na verificação SHA-256 do Node.js.");
  await writeFile(directory + "/node.exe", binary);
}
await writeFile(
  directory + "/Node-LICENSE.txt",
  await download(
    `https://raw.githubusercontent.com/nodejs/node/${version}/LICENSE`,
  ),
);
await build({
  entryPoints: ["server/index.mjs"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: ".runtime/server.cjs",
  sourcemap: false,
});
await mkdir(".runtime/desktop", { recursive: true });
await build({
  entryPoints: ["desktop/main.cjs"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["electron"],
  outfile: ".runtime/desktop/main.cjs",
  sourcemap: false,
});
for (const name of [
  "preload.cjs",
  "print-raw.ps1",
  "icon.png",
  "icon.ico",
  "THIRD-PARTY-NOTICES.txt",
])
  await copyFile(`desktop/${name}`, `.runtime/desktop/${name}`);
console.log("Servidor e desktop empacotados; runtime Windows verificado.");
