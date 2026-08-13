import { defineConfig } from "vitest/config"

/**
 * The sync server's own test config.
 *
 * This file must exist even though its settings are close to the defaults.
 * Without a config here, `vitest run` started from server/ finds nothing and
 * walks UP to the repo root's vitest.config.ts, which imports from the
 * ROOT's devDependencies. That resolves fine on a machine where the root
 * `npm install` has also been run — and fails in CI, where the server job
 * installs only server/package-lock.json. The failure is a confusing
 * "Cannot find package 'vitest'" pointing at a config file in a directory
 * this package does not own.
 *
 * It is the exact mirror of the trap the root config documents: the root
 * excludes server/**, and this stops the walk upward. Both halves are
 * needed, because the two packages have separate dependency trees.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
})
