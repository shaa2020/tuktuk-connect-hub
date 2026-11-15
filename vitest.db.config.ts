import { defineConfig } from "vitest/config";
import path from "node:path";

// Database policy tests. Run via `bash scripts/db-test/run.sh` (starts a throwaway Postgres).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["db-tests/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20000,
  },
});
