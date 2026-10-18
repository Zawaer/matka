import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Integration tests share one database.
    fileParallelism: false,
  },
});
