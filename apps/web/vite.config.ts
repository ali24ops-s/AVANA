import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== "production";

// https://vite.dev/config/
export default defineConfig({
  // viteSingleFile is only used in production build mode.
  // In dev it conflicts with the proxy and HMR.
  plugins: isDev ? [react(), tailwindcss()] : [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    // Bind to 127.0.0.1 only — prevents IPv4/IPv6 address ambiguity where
    // macOS can route 'localhost' to different sockets across sessions.
    host: "127.0.0.1",
    port: 5173,
    // Fail immediately if port is taken by a stale process instead of
    // silently picking 5174, 5175, etc. which confuse the browser.
    strictPort: true,
    proxy: {
      "/v1": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        // Preserve host so cookies/CORS work correctly
        headers: {
          "X-Forwarded-Host": "localhost:5173",
        },
      },
    },
  },
});
