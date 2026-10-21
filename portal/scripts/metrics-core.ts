import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { buildModel, type Model } from "../src/model/core"

const SKIP = new Set(["node_modules", ".git", "build", "DerivedData", ".next", "out", "Pods", ".build", "graphify-out", "dist"])

const CODE_ROOTS = new Set(["backend", "web", "ios"])

function files(root: string, ext: string[], exclude: string[]) {
  const out: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      if (SKIP.has(f)) continue
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (ext.some((e) => f.endsWith(e)) && !exclude.some((x) => p.includes(x)) && !/generated/i.test(p)) out.push(p)
    }
  }
  walk(root)
  return out
}

export type MetricResult = { id: string; name: string; baseline: number; target: number; current: number | null; progress: number | null; cap?: boolean; note?: string }

export function loadModel(dir: string): Model {
  if (!existsSync(dir)) return buildModel({})
  return buildModel(Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => [f, readFileSync(join(dir, f), "utf8")])))
}

export function computeMetrics(dir: string): MetricResult[] {
  const m = loadModel(dir)
  const base = join(dir, "..")
  return m.elements.filter((e) => e.kind === "metrics").map((e) => {
    const r = e.raw as Record<string, any>
    const res: MetricResult = { id: e.id, name: e.name, baseline: Number(r.baseline), target: Number(r.target), current: null, progress: null }
    if (r.measure === "model") res.current = m.findings.filter((f) => f.severity === "error").length
    else {
      const root = join(base, String(r.root))
      const top = String(r.root).split("/")[0]
      if (!CODE_ROOTS.has(top) || String(r.root).includes("..")) return { ...res, note: `${r.root} is outside backend/, web/, ios/` }
      if (!existsSync(root)) return { ...res, note: `${r.root} not found` }
      const fs = files(root, r.ext ?? [], r.exclude ?? [])
      const lines = (p: string) => readFileSync(p, "utf8").split("\n").length
      if (r.measure === "lines") res.current = fs.reduce((a, p) => a + lines(p), 0)
      if (r.measure === "maxfile") res.current = Math.max(0, ...fs.map(lines))
      if (r.measure === "filesover") res.current = fs.filter((p) => lines(p) > Number(r.limit)).length
      if (r.measure === "grep") {
        const re = new RegExp(String(r.pattern), "g")
        res.current = fs.reduce((a, p) => a + (readFileSync(p, "utf8").match(re)?.length ?? 0), 0)
      }
    }
    if (r.direction === "cap") {
      res.cap = true
      res.progress = res.current === null ? null : res.current <= res.target ? 1 : 0
      return res
    }
    const span = res.baseline - res.target
    res.progress = res.current === null ? null : span > 0 ? Math.max(0, Math.min(1, (res.baseline - res.current) / span)) : res.current <= res.target ? 1 : 0
    return res
  })
}
