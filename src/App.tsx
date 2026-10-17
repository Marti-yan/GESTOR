import { lazy, Suspense, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Menu, Tracking, type Catalog } from "./PublicMenu";
const Manager = lazy(() =>
  import("./Manager").then((m) => ({ default: m.Manager })),
);
const StaffApp = lazy(() =>
  import("./Staff").then((m) => ({ default: m.StaffApp })),
);
const CourierApp = lazy(() =>
  import("./Couriers").then((m) => ({ default: m.CourierApp })),
);
export function currentRoute() {
  if (typeof window === "undefined") return "/";
  return (
    window.location.hash.slice(1) ||
    (window.location.pathname.startsWith("/entregador")
      ? "/entregador"
      : window.location.pathname.startsWith("/garcom")
        ? "/garcom"
        : window.prontoDesktop
          ? "/gestor"
          : "/")
  );
}
export function App({
  initialCatalog,
  initialRoute,
}: {
  initialCatalog?: Catalog;
  initialRoute?: string;
}) {
  const [route, setRoute] = useState(initialRoute || currentRoute),
    [toast, setToast] = useState("");
  useEffect(() => {
    const handler = () => setRoute(currentRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    document
      .querySelector('link[rel="manifest"]')
      ?.setAttribute(
        "href",
        route.startsWith("/entregador")
          ? "/entregador.webmanifest"
          : route.startsWith("/garcom")
            ? "/garcom.webmanifest"
            : "/manifest.webmanifest",
      );
  }, [route]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4200);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  return (
    <Suspense fallback={<p className="operation-panel">Carregando módulo…</p>}>
      {route.startsWith("/entregador") ? (
        <CourierApp />
      ) : route.startsWith("/garcom") ? (
        <StaffApp />
      ) : route.startsWith("/gestor") ? (
        <Manager route={route} notify={setToast} />
      ) : route.startsWith("/acompanhar/") ? (
        <Tracking token={route.split("/")[2]} />
      ) : (
        <Menu notify={setToast} initialCatalog={initialCatalog} />
      )}
      <div className={`toast ${toast ? "visible" : ""}`} role="status">
        <CheckCircle2 size={18} />
        {toast}
      </div>
    </Suspense>
  );
}
