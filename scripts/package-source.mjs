import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
mkdirSync("artifacts", { recursive: true });
execFileSync(
  "python3",
  [
    "-c",
    `from pathlib import Path
import zipfile
root=Path.cwd()
excluded={'.git','node_modules','release','.runtime','.data','artifacts','test-results','.env','__pycache__'}
with zipfile.ZipFile(root/'artifacts/Pronto-Gestor-Codigo-Fonte.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in root.rglob('*'):
  if p.is_file() and not any(part in excluded for part in p.relative_to(root).parts) and not p.name.endswith('.log'):
   z.write(p,Path('pronto-gestor')/p.relative_to(root))
`,
  ],
  { stdio: "inherit" },
);
console.log("artifacts/Pronto-Gestor-Codigo-Fonte.zip");
