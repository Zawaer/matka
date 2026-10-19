#!/usr/bin/env node
// MapLibre 6 starts its worker from a file next to its own module
// (new URL("./maplibre-gl-worker.mjs", import.meta.url)), which Next's bundler
// doesn't reproduce: the map hangs on "Worker failed to load". Serve the
// installed version's worker from public/ instead; MapView points
// setWorkerUrl() at it. Runs before `next build` and `next dev`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const src = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist/maplibre-gl-worker.mjs");
const dst = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "maplibre-gl-worker.mjs");
mkdirSync(path.dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log(`copy-maplibre-worker: ${path.relative(process.cwd(), dst)}`);
