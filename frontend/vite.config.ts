import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiOrigin = process.env.CCLONE_CONTROL_V3_API_ORIGIN || "http://127.0.0.1:8796";

export default defineConfig({
  plugins: [react({})],
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "../backend/dist/public"),
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5177,
    proxy: {
      "/api": {
        target: apiOrigin,
        changeOrigin: true
      }
    }
  }
});
