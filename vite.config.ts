import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8787" } },
  preview: { port: 4173 },
  build: { target: "es2022" },
});
