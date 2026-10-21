import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { isMap, isSeq, parseDocument } from "yaml"
import type { Plugin } from "vite"
import { buildModel } from "../src/model/core"
import { computeMetrics } from "./metrics-core"

const STATUSES = new Set(["planned", "wip", "built", "verified", "drift", "later"])

export function setStatus(dir: string, id: string, status: string) {
  if (!STATUSES.has(status)) throw new Error("unknown status")
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".yaml"))) {
    const path = join(dir, f)
    const doc = parseDocument(readFileSync(path, "utf8"))
    let hit = false
    const root = doc.contents
    if (!isMap(root)) continue
    for (const pair of root.items) {
      if (!isSeq(pair.value)) continue
      for (const item of pair.value.items) {
        const m = item as unknown as { get: (k: string) => unknown; set: (k: string, v: string) => void }
        if (isMap(item) && m.get("id") === id) {
          m.set("status", status)
          hit = true
        }
      }
    }
    if (hit) {
      writeFileSync(path, doc.toString({ lineWidth: 0 }))
      return f
    }
  }
  throw new Error("id not found")
}

export function history(dir: string) {
  const root = join(dir, "..")
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" })
  const log = git("log", "--format=%H|%h|%ad|%s", "--date=format:%Y-%m-%d %H:%M", "--", "architecture").trim().split("\n").filter(Boolean)
  return log.reverse().map((line) => {
    const [sha, short, date, subject] = line.split("|")
    const files = git("ls-tree", "--name-only", sha, "architecture/").trim().split("\n").filter((f) => f.endsWith(".yaml"))
    let m
    try {
      m = buildModel(Object.fromEntries(files.map((f) => [f.split("/").pop()!, git("show", `${sha}:${f}`)])))
    } catch {
      return { sha: short, date, subject, elements: 0, edges: 0, status: {}, findings: { error: 0, warning: 0, info: 0 } }
    }
    const status: Record<string, number> = {}
    for (const e of m.elements) status[e.status] = (status[e.status] ?? 0) + 1
    const sev: Record<string, number> = { error: 0, warning: 0, info: 0 }
    for (const f of m.findings) sev[f.severity]++
    return { sha: short, date, subject, elements: m.elements.length, edges: m.edges.length, status, findings: sev }
  })
}

export function modelWrite(dir: string): Plugin {
  return {
    name: "model-write",
    configureServer(server) {
      server.middlewares.use("/api/metrics", (_req, res) => {
        try {
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(computeMetrics(dir)))
        } catch (e) {
          res.writeHead(500).end(String((e as Error).message))
        }
      })
      server.middlewares.use("/api/history", (_req, res) => {
        try {
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(history(dir)))
        } catch (e) {
          res.writeHead(500).end(String((e as Error).message))
        }
      })
      server.middlewares.use("/api/status", (req, res) => {
        if (req.method !== "POST") return void res.writeHead(405).end()
        let body = ""
        req.on("data", (c) => (body += c))
        req.on("end", () => {
          try {
            const { id, status } = JSON.parse(body)
            const file = setStatus(dir, String(id), String(status))
            res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ file }))
          } catch (e) {
            res.writeHead(400).end(String((e as Error).message))
          }
        })
      })
    },
  }
}
