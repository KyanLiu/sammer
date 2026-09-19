import { defineConfig, loadEnv } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig(({ mode }) => {
  // loadEnv, not import.meta.env: this file runs in Node at config-load
  // time, before there's a client bundle to expose anything to.
  const env = loadEnv(mode, process.cwd());
  const apiPort = env.VITE_DEV_API_PORT || "8080";

  return {
    plugins: [svelte()],
    server: {
      proxy: {
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
