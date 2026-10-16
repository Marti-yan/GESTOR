import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
const [artifactCommit, output = "updates/windows.json"] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(artifactCommit || ""))
  throw new Error(
    "Informe o commit imutável da branch de downloads: node scripts/create-update-manifest.mjs COMMIT [arquivo-de-saída]",
  );
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const filename = `Reparar-Pronto-${version}.exe`,
  binary = readFileSync(`release/${filename}`);
if (binary.subarray(0, 2).toString() !== "MZ")
  throw new Error("Atualizador Windows não encontrado ou inválido.");
const manifest = {
  version,
  minVersion: "0.2.0",
  url: `https://raw.githubusercontent.com/Marti-yan/GESTOR/${artifactCommit}/${filename}`,
  size: binary.length,
  sha256: createHash("sha256").update(binary).digest("hex"),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  notes: [
    "Editor de comandas simplificado e espaço extra entre linhas em milímetros.",
    "Modelos geral, batata e balcão; número de comandas bem grande em cada via.",
    "Complementos e adicionais, com preços e destaques configuráveis.",
    "Via opcional do balcão e atualização pelo próprio gestor.",
  ],
};
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `Manifesto ${version} gerado em ${output}; publique em main (ou master) depois de publicar e verificar o executável.`,
);
