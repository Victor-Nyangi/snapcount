import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: "../backend/app/frontend",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["tests/**", "node_modules/**"],
    // Must stay ABOVE the `asyncUtilTimeout` set in vitest.setup.ts, or a
    // slow `findBy*` burns the whole test budget and vitest reports an
    // opaque "test timed out" instead of Testing Library's own "unable to
    // find …" — which names the element and dumps the DOM.
    testTimeout: 15000,
  },
})
