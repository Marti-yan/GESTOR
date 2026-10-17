import { renderToString } from "react-dom/server";
import { App } from "./App";
import type { Catalog } from "./PublicMenu";
export function renderMenu(catalog: Catalog) {
  return renderToString(<App initialCatalog={catalog} initialRoute="/" />);
}
