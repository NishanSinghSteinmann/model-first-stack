import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { buildModel, releaseStatus, rolesForPermission, routeScopes, type Element, type Model } from "../src/model/core"
import { KINDS, SECTIONS } from "../src/model/kinds"
import { setStatus } from "./model-write"
import { computeMetrics } from "./metrics-core"

const dir = join(import.meta.dirname, "../../architecture")

function load(): Model {
  return buildModel(Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => [f, readFileSync(join(dir, f), "utf8")])))
}

const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : [])
const brief = (e: Element) => ({ id: e.id, name: e.name, kind: e.kind, status: e.status })
const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] })

function element(m: Model, id: string) {
  const e = m.byId.get(id)
  if (!e) throw new Error(`Element ${id} does not exist`)
  const group = (edges: { from: string; to: string; field: string }[], side: "from" | "to") => {
    const r: Record<string, ReturnType<typeof brief>[]> = {}
    for (const x of edges) {
      const o = m.byId.get(x[side])
      if (o) (r[x.field] ??= []).push(brief(o))
    }
    return r
  }
  return {
    ...brief(e),
    file: `architecture/${e.file}`,
    kindLabel: KINDS[e.kind]?.label,
    raw: e.raw,
    references: group(m.out.get(id) ?? [], "to"),
    referencedBy: group(m.inc.get(id) ?? [], "from"),
    findings: m.findings.filter((f) => f.element === id),
  }
}

function trace(m: Model, id: string) {
  const r = m.byId.get(id)
  if (!r || r.kind !== "routes") throw new Error(`${id} is not a route`)
  const get = (x: string) => m.byId.get(x)
  const callers = arr(r.raw.callers).map(get).filter(Boolean) as Element[]
  const apps = callers.filter((c) => c.kind === "apps")
  const actors = m.elements.filter((a) => a.kind === "actors" && arr(a.raw.clients).some((c) => apps.some((x) => x.id === c)))
  const devices = m.elements.filter((d) => d.kind === "devices" && actors.some((a) => arr(a.raw.uses).includes(d.id)) && arr(d.raw.runs).some((x) => apps.some((a) => a.id === x)))
  const perm = r.raw.permission ? get(String(r.raw.permission)) : undefined
  const tables = arr(r.raw.reads).map(get).filter(Boolean) as Element[]
  const jobs = m.elements.filter((j) => j.kind === "jobs" && j.raw.trigger === r.id)
  const deep = [...jobs, ...m.elements.filter((j) => j.kind === "jobs" && jobs.some((x) => x.id === j.raw.trigger))]
  return {
    route: `${r.raw.method} ${r.raw.path}`,
    scope: routeScopes(m, r),
    steps: [
      { layer: "Actor", items: actors.map(brief) },
      { layer: "Device", items: devices.map(brief) },
      { layer: "Client", items: callers.map(brief) },
      { layer: "① Edge", items: [...arr(get("shell.edge")?.raw.controls)].map(get).filter(Boolean).map((e) => brief(e!)) },
      { layer: "② Request", auth: r.raw.public ? (r.raw.signature ? "signature" : "no token") : "JWT → principal", request: r.raw.request ?? null, unknownFields: "400" },
      { layer: "③ Access", permission: perm ? brief(perm) : null, public: r.raw.public ?? null, roles: perm ? rolesForPermission(m, perm.id).map(brief) : [], stepUp: perm?.raw.step_up ?? false, delay: perm?.raw.delay ?? null, audited: perm?.raw.audited ?? false, denied: "403, foreign org 404" },
      { layer: "④ Business logic", module: r.raw.module ?? null, uses: arr(r.raw.uses) },
      { layer: "⑤ Data", tables: tables.map((t) => ({ id: t.id, name: t.name, rls: t.raw.rls, columns: t.raw.columns })) },
      { layer: "⑥ Outbound", jobs: deep.map(brief), externals: [...new Set(deep.flatMap((j) => arr(j.raw.uses)))].map(get).filter(Boolean).map((e) => ({ ...brief(e!), country: e!.raw.country })) },
      { layer: "Response", response: r.raw.response ?? null, idempotency: r.raw.idempotency ?? null },
    ],
    findings: m.findings.filter((f) => f.element === id),
  }
}

function reach(m: Model, roleId: string) {
  const role = m.byId.get(roleId)
  if (!role || role.kind !== "roles") throw new Error(`${roleId} is not a role`)
  const perms = new Set(arr(role.raw.grants))
  const routes = m.elements.filter((e) => e.kind === "routes" && (e.raw.public || perms.has(String(e.raw.permission))))
  const tables = [...new Set(routes.flatMap((r) => arr(r.raw.reads)))].map((t) => m.byId.get(t)).filter(Boolean) as Element[]
  return {
    role: brief(role),
    permissions: [...perms],
    routes: routes.map((r) => ({ id: r.id, route: `${r.raw.method} ${r.raw.path}`, public: !!r.raw.public })),
    tables: tables.map((t) => ({ id: t.id, name: t.name, classes: [...new Set(((t.raw.columns as { class: string }[]) ?? []).map((c) => c.class))] })),
  }
}

const server = new McpServer({ name: "model-first-stack", version: "0.1.0" })

server.tool("overview", "Overview of the architecture model: sections, element count per kind, findings by severity.", {}, async () => {
  const m = load()
  const kinds: Record<string, number> = {}
  for (const e of m.elements) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1
  const sev = { error: 0, warning: 0, info: 0 }
  for (const f of m.findings) sev[f.severity]++
  return json({ elements: m.elements.length, edges: m.edges.length, findings: sev, kinds, sections: SECTIONS.map((s) => ({ id: s.id, label: s.label, kinds: s.kinds })) })
})

server.tool("list", "List elements of a kind, e.g. routes, tables, modules, roles, features, releases.", { kind: z.string() }, async ({ kind }) => {
  const m = load()
  return json(m.elements.filter((e) => e.kind === kind).map((e) => ({ ...brief(e), description: e.raw.description })))
})

server.tool("search", "Search elements by name or ID.", { query: z.string(), limit: z.number().int().optional() }, async ({ query, limit }) => {
  const m = load()
  const q = query.toLowerCase()
  return json(m.elements.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)).slice(0, limit ?? 30).map(brief))
})

server.tool("get", "One element with all properties, references, back-references (what it is responsible for) and findings.", { id: z.string() }, async ({ id }) => json(element(load(), id)))

server.tool("trace_route", "Trace a request from actor to response through all shells: fields, scope, roles, tables, jobs, external services.", { id: z.string().describe("Route ID, e.g. route.orgs.bank.put") }, async ({ id }) => json(trace(load(), id)))

server.tool("findings", "Findings of the model check, optionally filtered by severity, rule or element.", {
  severity: z.enum(["error", "warning", "info"]).optional(),
  rule: z.string().optional(),
  element: z.string().optional(),
}, async ({ severity, rule, element: el }) => {
  const m = load()
  return json(m.findings.filter((f) => (!severity || f.severity === severity) && (!rule || f.rule.toLowerCase().includes(rule.toLowerCase())) && (!el || f.element === el)))
})

server.tool("release_status", "Whether a release is ready: open features, open prerequisites, errors in scope.", { id: z.string().describe("e.g. release.0-1") }, async ({ id }) => {
  const s = releaseStatus(load(), id)
  return json({ release: brief(s.release), ready: s.ready, open: s.open.map(brief), blockers: s.blockers.map(brief), errors: s.errors, findings: s.findings.length })
})

server.tool("role_reach", "What a role can reach: permissions, routes, tables with data classes.", { id: z.string().describe("e.g. role.org-member") }, async ({ id }) => json(reach(load(), id)))

server.tool("set_status", "Change an element's status in the YAML (planned, wip, built, verified, drift, later). Writes to architecture/.", {
  id: z.string(),
  status: z.enum(["planned", "wip", "built", "verified", "drift", "later"]),
}, async ({ id, status }) => {
  const file = setStatus(dir, id, status)
  return json({ ok: true, file: `architecture/${file}`, element: brief(load().byId.get(id)!) })
})

server.tool("metrics", "Roadmap metrics: baseline, current value, target, progress (lines, file sizes, pattern counts).", {}, async () => json(computeMetrics(dir)))

server.tool("roadmap", "Roadmap: goals with metrics, phases, steps with gates and guardrails.", {}, async () => {
  const m = load()
  const of = (k: string) => m.elements.filter((e) => e.kind === k)
  return json({
    goals: of("goals").map((g) => ({ ...brief(g), metrics: g.raw.metrics })),
    phases: of("phases").map((p) => ({ ...brief(p), steps: of("steps").filter((s) => s.raw.phase === p.id).map((s) => ({ ...brief(s), goals: s.raw.goals, gate: s.raw.gate, deletes: s.raw.deletes, generates: s.raw.generates, guards: s.raw.guards })) })),
  })
})

await server.connect(new StdioServerTransport())
