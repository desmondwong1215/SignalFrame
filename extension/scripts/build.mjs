import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build, context } from "esbuild";

const root = process.cwd();
const dist = resolve(root, "dist");
const watch = process.argv.includes("--watch");

await mkdir(dist, { recursive: true });

const shared = {
  bundle: true,
  sourcemap: false,
  target: "chrome120",
  logLevel: "info"
};

const contentConfig = {
  ...shared,
  entryPoints: [resolve(root, "src/content.tsx")],
  outfile: resolve(dist, "content.js"),
  format: "iife"
};

const popupConfig = {
  ...shared,
  entryPoints: [resolve(root, "src/popup.tsx")],
  outfile: resolve(dist, "popup.js"),
  format: "iife"
};

const backgroundConfig = {
  ...shared,
  entryPoints: [resolve(root, "src/background.ts")],
  outfile: resolve(dist, "background.js"),
  format: "esm"
};

if (watch) {
  const contentCtx = await context(contentConfig);
  const popupCtx = await context(popupConfig);
  const backgroundCtx = await context(backgroundConfig);
  await contentCtx.watch();
  await popupCtx.watch();
  await backgroundCtx.watch();
  await copyFile(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
  await copyFile(resolve(root, "popup.html"), resolve(dist, "popup.html"));
  console.log("Watching extension builds. Press Ctrl+C to stop.");
  await new Promise(() => {});
} else {
  await build(contentConfig);
  await build(popupConfig);
  await build(backgroundConfig);
  await copyFile(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
  await copyFile(resolve(root, "popup.html"), resolve(dist, "popup.html"));
}
