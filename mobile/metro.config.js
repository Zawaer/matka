// Default Expo Metro config. With MATKA_PREVIEW=1 (see preview/README.md) a few
// native-only modules are swapped for web mocks so the real screens can be
// rendered in a browser and screenshotted. Without the variable, nothing changes.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (process.env.MATKA_PREVIEW === "1") {
  const mocks = path.resolve(__dirname, "preview/mocks");
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const swap = (file) => ({ type: "sourceFile", filePath: file });
    if (moduleName === "expo-task-manager") return swap(path.join(mocks, "task-manager.ts"));
    if (moduleName === "react-native-webview") return swap(path.join(mocks, "webview.tsx"));
    if (/(^|\/)collector$/.test(moduleName)) return swap(path.join(mocks, "collector.ts"));
    if (moduleName === "./App" && /index\.ts$/.test(context.originModulePath)) {
      return swap(path.resolve(__dirname, "preview/PreviewApp.tsx"));
    }
    return (upstream ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
