import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server on 5173. /api is proxied to the local backend so the app code
// only ever uses the RELATIVE base URL "/api/v1" — never localhost — which
// means the production build works unchanged behind any reverse proxy.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
      },
    },
  },
});
