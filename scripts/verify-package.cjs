const {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} = require("node:fs");
const { createHash } = require("node:crypto");
const {
  join,
  resolve,
  dirname,
  relative,
  sep,
  isAbsolute,
} = require("node:path");
const { builtinModules, wrap } = require("node:module");
const vm = require("node:vm");
const { extractFile, statFile } = require("@electron/asar");

// Valida o pacote real: executar somente o código-fonte não detecta módulos
// movidos pelo electron-builder de app.asar para extraResources.
function verifyPackage(appOutDir) {
  const resources = join(resolve(appOutDir), "resources");
  const archive = join(resources, "app.asar");
  const metadata = JSON.parse(extractFile(archive, "package.json").toString());
  for (const name of ["node.exe", "server-bundle.cjs", "web/index.html"]) {
    if (!existsSync(join(resources, name)))
      throw new Error(`Recurso ausente no aplicativo: ${name}`);
  }
  if (
    readFileSync(join(resources, "node.exe")).subarray(0, 2).toString() !== "MZ"
  )
    throw new Error("O runtime incluído não é um executável Windows.");

  const cache = new Map();
  const context = vm.createContext({
    Buffer,
    URL,
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    process: { resourcesPath: resources, env: {}, platform: "win32" },
  });
  const electron = {
    app: {
      isPackaged: true,
      requestSingleInstanceLock: () => false,
      quit() {},
    },
  };
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    let source;
    if (filename.startsWith(archive + sep)) {
      const name = relative(archive, filename).split(sep).join("/");
      try {
        statFile(archive, name);
        source = extractFile(archive, name).toString();
      } catch {
        throw new Error(`Módulo ausente em app.asar: ${name}`);
      }
    } else {
      if (!filename.startsWith(resources + sep))
        throw new Error(`Módulo fora do pacote: ${filename}`);
      source = readFileSync(filename, "utf8");
    }
    const module = { exports: {} };
    cache.set(filename, module);
    function packagedRequire(request) {
      if (request === "electron") return electron;
      if (builtinModules.includes(request) || request.startsWith("node:"))
        return require(request);
      if (request.startsWith(".") || isAbsolute(request))
        return load(resolve(dirname(filename), request));
      throw new Error(
        `Dependência não verificada no processo principal: ${request}`,
      );
    }
    const entry = new vm.Script(wrap(source), { filename }).runInContext(
      context,
    );
    entry(module.exports, packagedRequire, module, filename, dirname(filename));
    return module.exports;
  }
  // O Electron é simulado somente para impedir abertura de janelas/processos.
  // As importações locais usam exclusivamente os arquivos presentes no pacote.
  load(join(archive, metadata.main));
  for (const name of ["desktop/preload.cjs"]) {
    new vm.Script(wrap(extractFile(archive, name).toString()), {
      filename: name,
    });
  }
  if (
    !extractFile(archive, "desktop/print-raw.ps1")
      .toString()
      .includes("WritePrinter")
  )
    throw new Error("O suporte de impressão RAW não está no pacote.");
  console.log(
    `Pacote ${metadata.version} verificado: módulos de inicialização e recursos presentes.`,
  );
  return { resources, metadata };
}

module.exports = async (context) => {
  const { resources, metadata } = verifyPackage(context.appOutDir);
  const hash = (name) =>
    createHash("sha256")
      .update(readFileSync(join(resources, name)))
      .digest("hex");
  const manifest = { version: metadata.version, files: {} };
  const webFiles = readdirSync(join(resources, "web"), { recursive: true })
    .filter((name) => statSync(join(resources, "web", name)).isFile())
    .map((name) => "web/" + name.split(sep).join("/"))
    .sort();
  for (const name of ["app.asar", "server-bundle.cjs", ...webFiles])
    manifest.files[name] = hash(name);
  writeFileSync(
    join(resources, "pronto-build.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const quote = (value) => value.replaceAll("$", "$$").replaceAll('"', '$\\"');
  const lines = [
    "!macro ProntoInstallCritical",
    '  SetOutPath "$INSTDIR\\resources"',
    "  SetOverwrite on",
  ];
  for (const name of [...Object.keys(manifest.files), "pronto-build.json"]) {
    const destination = name.replaceAll("/", "\\"),
      fileName = name.split("/").at(-1);
    lines.push(
      `  SetOutPath "$INSTDIR\\resources\\${dirname(name) === "." ? "" : dirname(name).replaceAll("/", "\\")}"`,
      "  ClearErrors",
      `  File /oname=${fileName} "${quote(join(resources, name))}"`,
      "  IfErrors ProntoCriticalFailure",
      '  ${StdUtils.HashFile} $R8 "SHA2-256" "$INSTDIR\\resources\\' +
        destination +
        '"',
      `  StrCmp $R8 "${hash(name)}" 0 ProntoCriticalFailure`,
    );
  }
  lines.push(
    "  Goto ProntoCriticalDone",
    "  ProntoCriticalFailure:",
    '    MessageBox MB_OK|MB_ICONSTOP "Não foi possível substituir e verificar os arquivos do Pronto. Feche o programa, inclusive a janela de erro, e execute o reparador novamente. A atualização não foi concluída."',
    "    Abort",
    "  ProntoCriticalDone:",
    '  SetOutPath "$INSTDIR"',
    "!macroend",
  );
  const runtime = join(context.packager.projectDir, ".runtime");
  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(runtime, "critical-files.nsh"), lines.join("\n") + "\n");
};
module.exports.verifyPackage = verifyPackage;
if (require.main === module)
  verifyPackage(process.argv[2] || "release/win-unpacked");
