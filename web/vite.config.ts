import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, "..");

export default defineConfig({
  plugins: [react()],
  root,
  resolve: {
    alias: {
      "@core": resolve(repoRoot, "core"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
    proxy: {
      "/api": process.env.API_ORIGIN ?? "http://localhost:3000",
    },
  },
});
