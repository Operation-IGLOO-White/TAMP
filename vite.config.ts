import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function describeGit() {
  try {
    return execFileSync("git", ["describe", "--tags", "--always"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function semanticVersion(description: string, baseVersion: string) {
  const taggedVersion = description.match(/^v?(\d+\.\d+\.\d+)(?:-|$)/i)?.[1];
  return taggedVersion || baseVersion;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const localDescription = describeGit();
  const configuredDescription = env["VITE_GIT_VERSION"] || "";
  const gitDescription =
    configuredDescription && configuredDescription !== "dev"
      ? configuredDescription
      : localDescription || configuredDescription || "dev";
  const appVersion = semanticVersion(gitDescription, env["VITE_APP_VERSION"] || "0.1.0");
  const port = Number.parseInt(env["FRONTEND_PORT"] || "3000", 10);
  const allowedHosts = (env["VITE_ALLOWED_HOSTS"] || "localhost")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const proxy = {
    "/api": { target: env["VITE_API_TARGET"] || "http://localhost:5000", changeOrigin: true, ws: true },
  };
  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: { port, allowedHosts, proxy },
    preview: { port, allowedHosts, proxy },
  };
});
