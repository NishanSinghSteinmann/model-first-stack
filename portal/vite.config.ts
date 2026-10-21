import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { modelWrite } from "./scripts/model-write"

export default defineConfig({
  plugins: [react(), tailwindcss(), modelWrite(path.resolve(__dirname, "../architecture"))],
  resolve: { dedupe: ["three"], alias: { "@": path.resolve(__dirname, "./src"), "@model": path.resolve(__dirname, "../architecture") } },
  server: { fs: { allow: [".."] } },
})
