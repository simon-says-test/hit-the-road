import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
  },
  test: {
    // Vitest's own default exclude list, plus the Playwright e2e suite
    // (e2e/tests/*.spec.ts) and its output dirs — without this, Vitest's
    // default *.spec.ts matcher picks up the Playwright tests too (they
    // use a different `test()` API entirely and fail immediately). The
    // e2e suite runs via `npm run test:e2e` instead — see e2e/playwright.config.ts.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
      "e2e/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
});
