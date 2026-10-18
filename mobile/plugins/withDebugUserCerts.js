// Debug builds trust user-installed CAs, so the dev client can load Metro
// over the homelab's private-CA HTTPS preview URLs (*.preview.lan).
// <debug-overrides> only applies when the app is debuggable, so release
// builds keep Android's default (system CAs only).
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- Overrides usesCleartextTraffic once this file exists; the API is http:// for now. -->
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <debug-overrides>
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </debug-overrides>
</network-security-config>
`;

module.exports = function withDebugUserCerts(config) {
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "network_security_config.xml"), XML);
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return cfg;
  });
};
