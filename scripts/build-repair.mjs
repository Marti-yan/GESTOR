import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  getMakeNsisPath,
  getNsisPluginsPath,
} = require("app-builder-lib/out/toolsets/windows.js");
const project = resolve(".");
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const compiler = await getMakeNsisPath();
const plugins = await getNsisPluginsPath();
const include = join(
  project,
  "node_modules/app-builder-lib/templates/nsis/include",
);
const output = join(project, `release/Reparar-Pronto-${version}.exe`);
execFileSync(
  compiler.path,
  [
    "-V2",
    `-DPRONTO_PROJECT=${project}`,
    `-DPRONTO_VERSION=${version}`,
    `-DPRONTO_OUTPUT=${output}`,
    `-X!addincludedir "${include}"`,
    `-X!addplugindir /x86-unicode "${join(plugins, "x86-unicode")}"`,
    join(project, "desktop/repair.nsi"),
  ],
  {
    env: { ...process.env, ...compiler.env },
    stdio: "inherit",
  },
);
console.log(`Reparador gerado: ${output}`);
