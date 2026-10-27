import { defineConfig, loadEnv } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const env = { ...loadEnv(mode, root, ""), ...process.env };
  const cert = env.KYTEW_TLS_CERT,
    key = env.KYTEW_TLS_KEY;
  if (Boolean(cert) !== Boolean(key))
    throw new Error(
      "KYTEW_TLS_CERT and KYTEW_TLS_KEY must be provided together.",
    );
  const version = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
  ).version;
  return {
    define: { __KYTEW_VERSION__: JSON.stringify(version) },
    plugins: [react(), tailwind()],
    server: {
      port: 5173,
      strictPort: true,
      https:
        cert && key
          ? {
              cert: readFileSync(resolve(root, cert)),
              key: readFileSync(resolve(root, key)),
            }
          : undefined,
      proxy: {
        "/api": {
          target: "http://localhost:4000",
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/socket.io": { target: "http://localhost:4000", ws: true },
        "/livekit": {
          target: "http://localhost:7880",
          ws: true,
          rewrite: (path) => path.replace(/^\/livekit/, ""),
        },
      },
    },
    preview: { port: 5173 },
  };
});
