// Signs release builds with your own upload key instead of React Native's
// public debug key (which anyone can use, so anyone could sign an "update").
//
// The key never lives in this repo. The build reads a properties file on the
// build machine: $MATKA_SIGNING_FILE, or ~/.matka/signing.properties:
//
//   storeFile=/absolute/path/to/matka-release.jks
//   storePassword=...
//   keyAlias=matka
//   keyPassword=...
//
// Without that file the build falls back to the debug key and says so loudly.
// Set MATKA_REQUIRE_RELEASE_KEY=1 to make a missing key fail the build instead
// (an APK signed with another key can't update an installed one anyway).
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// matka: release signing";

const LOADER = `
${MARKER}
def matkaSigning = new Properties()
def matkaSigningFile = file(System.getenv("MATKA_SIGNING_FILE") ?: "\${System.getProperty('user.home')}/.matka/signing.properties")
if (matkaSigningFile.exists()) {
    matkaSigningFile.withInputStream { matkaSigning.load(it) }
}
def matkaHasKey = matkaSigning['storeFile'] != null
if (!matkaHasKey) {
    if (System.getenv("MATKA_REQUIRE_RELEASE_KEY") == "1") {
        throw new GradleException("Matka: no release key at \${matkaSigningFile} (MATKA_REQUIRE_RELEASE_KEY=1)")
    }
    logger.warn("Matka: no release key at \${matkaSigningFile}; signing release with the public DEBUG key")
}
`;

const RELEASE_CONFIG = `
        release {
            if (matkaHasKey) {
                storeFile file(matkaSigning['storeFile'])
                storePassword matkaSigning['storePassword']
                keyAlias matkaSigning['keyAlias']
                keyPassword matkaSigning['keyPassword']
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let s = cfg.modResults.contents;
    if (s.includes(MARKER)) return cfg;
    // Load the key before the android block.
    s = s.replace(/\nandroid \{/, `${LOADER}\nandroid {`);
    // Add a release signing config next to the debug one.
    s = s.replace(/(signingConfigs \{\s*\n\s*debug \{[^}]*\})/, `$1${RELEASE_CONFIG}`);
    // The release build type uses it when a key is present.
    const i = s.lastIndexOf("signingConfig signingConfigs.debug");
    const rel = s.indexOf("release {", s.indexOf("buildTypes {"));
    if (i < 0 || rel < 0 || i < rel) throw new Error("withReleaseSigning: unexpected app/build.gradle layout");
    s = s.slice(0, i) + "signingConfig matkaHasKey ? signingConfigs.release : signingConfigs.debug" + s.slice(i + "signingConfig signingConfigs.debug".length);
    cfg.modResults.contents = s;
    return cfg;
  });
};
