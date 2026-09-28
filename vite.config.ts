import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number.parseInt(env["FRONTEND_PORT"] || "3000", 10);
  const allowedHosts = (env["VITE_ALLOWED_HOSTS"] || "localhost")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const proxy = {
    "/api": { target: env["VITE_API_TARGET"] || "http://localhost:5000", changeOrigin: true },
  };
  return {
    plugins: [react()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: { port, allowedHosts, proxy },
    preview: { port, allowedHosts, proxy },
  };
});
