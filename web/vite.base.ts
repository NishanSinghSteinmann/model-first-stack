import tailwind from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { readFileSync } from "node:fs"
import { defineConfig, loadEnv, type Plugin } from "vite"

function devConfig(env: Record<string, string>): Plugin {
  return {
    name: "app-config",
    configureServer(server) {
      server.middlewares.use("/config.json", (_, res) => {
        res.setHeader("Content-Type", "application/json")
        res.end(JSON.stringify({ apiUrl: env.VITE_API_URL, authUrl: env.VITE_AUTH_URL }))
      })
    },
  }
}

export function app() {
  return defineConfig(({ mode }) => ({
    plugins: [react(), tailwind(), devConfig(loadEnv(mode, `${import.meta.dirname}`, "VITE_"))],
    define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync("package.json", "utf8")).version ?? "0.0.0") },
    build: { outDir: "dist", sourcemap: false },
  }))
}
