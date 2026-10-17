import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App, currentRoute } from "./App";
import "./styles.css";

const root = document.getElementById("root")!;
let initialCatalog;
try {
  initialCatalog = JSON.parse(
    document.getElementById("pronto-catalog")?.textContent || "null",
  );
} catch {}
const hydrate = Boolean(
  initialCatalog && currentRoute() === "/" && !window.prontoDesktop,
);
const app = (
  <React.StrictMode>
    <App
      initialCatalog={initialCatalog || undefined}
      initialRoute={hydrate ? "/" : undefined}
    />
  </React.StrictMode>
);
if (hydrate) hydrateRoot(root, app);
else createRoot(root).render(app);
if (
  "serviceWorker" in navigator &&
  import.meta.env.PROD &&
  !window.prontoDesktop
) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
