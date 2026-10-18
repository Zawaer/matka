// Keeps the Android build within a small build VM's memory. Without this the
// Gradle daemon was killed while Kotlin compilation and the C++ (CMake) builds
// ran in parallel. Trades some build speed for a build that finishes.
const { withGradleProperties } = require("expo/config-plugins");

const PROPS = {
  "org.gradle.jvmargs": "-Xmx2g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8",
  "org.gradle.parallel": "false",
  "org.gradle.workers.max": "1",
  // Compile Kotlin inside the Gradle daemon instead of a second large JVM.
  "kotlin.compiler.execution.strategy": "in-process",
};

module.exports = function withLowMemoryGradle(config) {
  return withGradleProperties(config, (cfg) => {
    const items = cfg.modResults.filter(
      (it) => !(it.type === "property" && it.key in PROPS),
    );
    for (const [key, value] of Object.entries(PROPS)) {
      items.push({ type: "property", key, value });
    }
    cfg.modResults = items;
    return cfg;
  });
};
