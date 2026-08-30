import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV !== "production";

// GitHub Pages uses repository name as subpath: /<repo-name>/
// Remote repository is 'AVANA', so default base for production is '/AVANA/' unless overridden by env
const base =
  process.env.BASE_PATH ||
  process.env.VITE_BASE_PATH ||
  process.env.BASE_URL ||
  (isDev ? "/" : "/AVANA/");

/**
 * Plugin to duplicate index.html to 404.html and create .nojekyll in production dist
 * to guarantee SPA routing works on direct refresh in GitHub Pages without Jekyll processing.
 */
function githubPagesSpaPlugin(): Plugin {
  return {
    name: "github-pages-spa-plugin",
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      const indexPath = path.join(distDir, "index.html");
      const notFoundPath = path.join(distDir, "404.html");
      const noJekyllPath = path.join(distDir, ".nojekyll");

      try {
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, notFoundPath);
          fs.writeFileSync(noJekyllPath, "");
        }
      } catch {
        // Best-effort: ignore file copy errors during dev/test runs
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base,
  // viteSingleFile is only used in production build mode.
  // In dev it conflicts with the proxy and HMR.
  plugins: isDev
    ? [react(), tailwindcss()]
    : [react(), tailwindcss(), viteSingleFile(), githubPagesSpaPlugin()],
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
