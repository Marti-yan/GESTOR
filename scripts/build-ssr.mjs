import { build } from "esbuild";
await build({
  entryPoints: ["src/menu-ssr.tsx"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  outfile: ".runtime/menu-ssr.cjs",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "empty" },
});
console.log("Cardápio com HTML inicial renderizado no servidor local.");
