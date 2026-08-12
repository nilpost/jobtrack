import { defineConfig } from "vitest/config"
import path from "path"

/**
 * The frontend test suite only.
 *
 * `server/` is excluded deliberately: it is a separate package with its own
 * dependencies and its own tsconfig, and without this exclusion vitest picks
 * up server/test/**  from the root. That happens to work on a machine where
 * `npm install` has been run inside server/ — and fails for anyone who
 * clones the repo and installs only the root, which is the normal case.
 *
 * Run both suites with `npm run test:all`.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "server/**"],
  },
})
