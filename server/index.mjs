import { createApplication } from "./app.mjs";
import { resolve } from "node:path";

const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 4317);
if (
  !["127.0.0.1", "localhost"].includes(host) &&
  !process.env.ADMIN_PASSWORD &&
  !process.env.PRONTO_BOOTSTRAP_TOKEN
) {
  console.error(
    "Defina ADMIN_PASSWORD (12+ caracteres) antes de expor o servidor na rede.",
  );
  process.exit(1);
}
const { app, db } = createApplication({
  host,
  dataDir: process.env.DATA_DIR || resolve(".data"),
  webDir: process.env.PRONTO_WEB_DIR || resolve("dist"),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  bootstrapToken: process.env.PRONTO_BOOTSTRAP_TOKEN || "",
  secureCookie: process.env.COOKIE_SECURE === "true",
});
const server = app.listen(port, host, () =>
  console.log(`Pronto disponível em http://${host}:${port}`),
);
function close() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
