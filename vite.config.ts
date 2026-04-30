import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-page app, packaged as ONE self-contained HTML file. No
// external assets, no server required — the director double-clicks
// the file and it runs from `file://` directly.
//
// Why this matters: any "run this command" step bounces the
// non-technical adopter. A single .html attachment in an email is
// the lowest possible friction. vite-plugin-singlefile inlines all
// JS + CSS into the HTML at build time so the entire app loads
// without any network calls or module imports.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: "./",
  build: {
    outDir: "dist",
    // Sourcemaps would inflate the inline-only build with no
    // file:// debugger benefit. Off.
    sourcemap: false,
    // Forces every asset (CSS, fonts, etc.) inline regardless of
    // size. Without this, vite externalizes assets > 4 KB.
    assetsInlineLimit: 100_000_000,
    // Inline every chunk so there's no async import() splitting.
    // file:// can't load chunks anyway.
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
