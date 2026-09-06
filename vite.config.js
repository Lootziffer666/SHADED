import { defineConfig } from "vite";
import { execSync } from "node:child_process";

// GOAL_WORLD.md G-2819 / GOAL_FOUNDATION.md F-0124: a delivered instance must be unambiguously
// traceable to the exact commit it was built from -- "looks fixed" and "is this commit" are
// different claims, and only a real build-time identifier lets anyone tell them apart. Falls back
// to "unknown" (never a fabricated placeholder SHA) if git isn't available at build time, e.g. a
// source tarball with no .git directory.
function commitSha() {
    try {
        return execSync("git rev-parse HEAD", { cwd: import.meta.dirname }).toString().trim();
    } catch {
        return "unknown";
    }
}

export default defineConfig({
    server: {
        port: 5173,
        strictPort: true,
    },
    build: {
        target: "esnext",
        sourcemap: true,
    },
    // .wgsl imported via ?raw
    assetsInclude: ["**/*.hdr", "**/*.env"],
    define: {
        __SHADED_COMMIT_SHA__: JSON.stringify(commitSha()),
        __SHADED_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
});
