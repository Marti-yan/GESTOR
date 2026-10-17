import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--watch", "server/index.mjs"], {
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
    { stdio: "inherit" },
  ),
];
function close() {
  for (const child of children) child.kill();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
for (const child of children)
  child.on("exit", (code) => {
    if (code) close();
  });
