// Default Expo Metro config. With MATKA_PREVIEW=1 (see preview/README.md) the
// native-only modules are swapped for web mocks so the real screens can be
// rendered in a browser and screenshotted, and the dev server serves
// placeholder photos for the mock Immich proxy. Without the variable, nothing changes.
const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (process.env.MATKA_PREVIEW === "1") {
  const mocks = path.resolve(__dirname, "preview/mocks");
  const src = path.resolve(__dirname, "src");
  const PACKAGES = {
    "expo-task-manager": "task-manager.ts",
    "react-native-webview": "webview.tsx",
    "expo-secure-store": "secure-store.ts",
    "expo-location": "location.ts",
    "expo-battery": "native-misc.ts",
    "expo-application": "native-misc.ts",
    "expo-intent-launcher": "native-misc.ts",
  };
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const swap = (file) => ({ type: "sourceFile", filePath: file });
    if (PACKAGES[moduleName]) return swap(path.join(mocks, PACKAGES[moduleName]));
    // src/db.ts (SQLite) → an in-memory stand-in.
    if (/^\.\.?\/(\.\.\/)*(src\/)?db$/.test(moduleName) && path.resolve(path.dirname(context.originModulePath), moduleName) === path.join(src, "db")) {
      return swap(path.join(mocks, "db.ts"));
    }
    if (moduleName === "./App" && /index\.ts$/.test(context.originModulePath)) {
      return swap(path.resolve(__dirname, "preview/PreviewApp.tsx"));
    }
    return (upstream ?? context.resolveRequest)(context, moduleName, platform);
  };

  // GET /api/immich/asset/:id → one of preview/photos/*.jpg, picked by the id.
  const photos = fs
    .readdirSync(path.resolve(__dirname, "preview/photos"))
    .filter((f) => f.endsWith(".jpg"))
    .sort()
    .map((f) => path.resolve(__dirname, "preview/photos", f));
  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware) => (req, res, next) => {
      const m = /^\/api\/immich\/asset\/([^/?]+)/.exec(req.url ?? "");
      if (!m) return middleware(req, res, next);
      const n = [...m[1]].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "max-age=3600" });
      res.end(fs.readFileSync(photos[n % photos.length]));
    },
  };
}

module.exports = config;
