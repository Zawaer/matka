// Keeps the Android build within a small build VM's memory. Without this the
// Gradle daemon was killed while Kotlin compilation and the C++ (CMake) builds
// ran in parallel. Trades some build speed for a build that finishes.
const { withAppBuildGradle, withGradleProperties } = require("expo/config-plugins");

const PROPS = {
  "org.gradle.jvmargs": "-Xmx2g -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8",
  "org.gradle.parallel": "false",
  "org.gradle.workers.max": "1",
  // Compile Kotlin inside the Gradle daemon instead of a second large JVM.
  "kotlin.compiler.execution.strategy": "in-process",
};

// Ninja runs one C++ compiler per CPU regardless of Gradle's worker limit;
// a CMake job pool caps the app's native build at one compile/link at a time.
const CMAKE_MARKER = "// matka: cmake job pools";
const CMAKE_BLOCK = `
        ${CMAKE_MARKER}
        externalNativeBuild {
            cmake {
                arguments "-DCMAKE_JOB_POOLS=compile=1;link=1",
                    "-DCMAKE_JOB_POOL_COMPILE=compile",
                    "-DCMAKE_JOB_POOL_LINK=link"
            }
        }`;

module.exports = function withLowMemoryGradle(config) {
  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(CMAKE_MARKER)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /defaultConfig\s*\{/,
        (m) => m + CMAKE_BLOCK,
      );
    }
    return cfg;
  });
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
