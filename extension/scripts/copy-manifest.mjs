import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const src = resolve(root, "manifest.json");
const distDir = resolve(root, "dist");
const dest = resolve(distDir, "manifest.json");

await mkdir(distDir, { recursive: true });
await copyFile(src, dest);
