import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { loadModel } from "./metrics-core"

const dir = join(import.meta.dirname, "../../architecture")
const root = join(dir, "..")
const m = loadModel(dir)
const terms = m.elements.filter((e) => e.kind === "glossary" && Array.isArray(e.raw.forbidden) && (e.raw.forbidden as string[]).length)
const targets = (process.argv[2] ?? "backend,web,ios,contracts,db").split(",").map((t) => join(root, t)).filter(existsSync)
const exts = [".go", ".ts", ".tsx", ".swift", ".sql", ".yaml"]
let hits = 0
const walk = (d: string, fn: (p: string) => void) => {
  for (const f of readdirSync(d)) {
    if (["node_modules", ".git", "dist", "generated"].includes(f)) continue
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p, fn)
    else if (exts.some((e) => f.endsWith(e))) fn(p)
  }
}
for (const t of targets) walk(t, (p) => {
  const text = readFileSync(p, "utf8")
  for (const term of terms) for (const bad of term.raw.forbidden as string[]) {
    const re = new RegExp(`\\b${bad}\\b`, "gi")
    const n = text.match(re)?.length ?? 0
    if (n) { hits += n; console.log(`${p.replace(root + "/", "")}: ${n}× "${bad}" instead of "${term.raw.english}"`) }
  }
})
console.log(targets.length ? `${hits} forbidden synonym hits` : "No code yet, nothing to check")
process.exit(hits ? 1 : 0)
