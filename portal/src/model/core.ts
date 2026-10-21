import { parse } from "yaml"

export type Status = "planned" | "wip" | "built" | "verified" | "drift" | "later"
export type Element = { id: string; name: string; kind: string; file: string; status: Status; raw: Record<string, unknown> }
export type Edge = { from: string; to: string; field: string; order?: number }
export type Severity = "error" | "warning" | "info"
export type Finding = { id: string; element: string; severity: Severity; rule: string; message: string }
export type Model = {
  elements: Element[]
  byId: Map<string, Element>
  edges: Edge[]
  out: Map<string, Edge[]>
  inc: Map<string, Edge[]>
  findings: Finding[]
}

const SKIP = new Set(["id", "name", "description", "columns", "status"])
const NONREF = new Set(["domain", "host", "path", "source", "terraform", "package", "method"])

export function buildModel(files: Record<string, string>): Model {
  const elements: Element[] = []
  for (const [file, text] of Object.entries(files)) {
    const doc = parse(text) as Record<string, unknown[]>
    for (const [kind, list] of Object.entries(doc ?? {})) {
      for (const item of (list ?? []) as Record<string, unknown>[]) {
        elements.push(toElement(item, kind, file))
        if (kind === "paths" && Array.isArray(item.steps)) {
          for (const step of item.steps as Record<string, unknown>[]) {
            elements.push(toElement({ ...step, path: item.id }, "deploysteps", file))
          }
        }
      }
    }
  }
  const byId = new Map(elements.map((e) => [e.id, e]))
  const edges: Edge[] = []
  const dangling: { element: string; value: string; field: string }[] = []
  for (const el of elements) {
    for (const [field, value] of Object.entries(el.raw)) {
      if (SKIP.has(field) || NONREF.has(field)) continue
      if (el.kind === "paths" && field === "steps") {
        ;(value as Record<string, unknown>[]).forEach((s, i) => edges.push({ from: el.id, to: String(s.id), field, order: i }))
        continue
      }
      const values = Array.isArray(value) ? value : [value]
      values.forEach((v, i) => {
        if (typeof v !== "string") return
        if (byId.has(v)) edges.push({ from: el.id, to: v, field, order: Array.isArray(value) ? i : undefined })
        else if (/^[a-z]+\.[\w:.\-]+$/.test(v) && PREFIXES.has(v.split(".")[0])) dangling.push({ element: el.id, value: v, field })
      })
    }
  }
  const out = group(edges, (e) => e.from)
  const inc = group(edges, (e) => e.to)
  const model: Model = { elements, byId, edges, out, inc, findings: [] }
  model.findings = findings(model, dangling)
  return model
}

const PREFIXES = new Set(["goal", "phase", "metric", "contract", "dev", "release", "actor", "boundary", "app", "shell", "mod", "abs", "route", "job", "ext", "tbl", "class", "ptype", "role", "perm", "infra", "env", "dom", "sec", "deploy", "step", "ctl", "check", "threat", "flow", "proc", "avv", "agr", "alert", "rb", "cost", "slice", "feat", "dec", "todo", "screen", "token", "term", "repo", "field", "err"])

function toElement(item: Record<string, unknown>, kind: string, file: string): Element {
  return {
    id: String(item.id),
    name: String(item.name ?? (item.method ? `${item.method} ${item.path}` : item.id)),
    kind,
    file,
    status: (item.status as Status) ?? "planned",
    raw: item,
  }
}

function group(edges: Edge[], key: (e: Edge) => string) {
  const m = new Map<string, Edge[]>()
  for (const e of edges) {
    const k = key(e)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(e)
  }
  return m
}

type Col = { name: string; type: string; class: string }
const cols = (t: Element | undefined) => ((t?.raw.columns as Col[] | undefined) ?? [])
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : [])
const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"])

export function routeScopes(m: Model, r: Element): string[] {
  if (r.raw.public) return ["public"]
  const s = new Set<string>()
  for (const ro of rolesForPermission(m, String(r.raw.permission))) s.add(ro.raw.principal === "ptype.service" ? "service" : String(ro.raw.scope))
  return [...s]
}

function findings(m: Model, dangling: { element: string; value: string; field: string }[]): Finding[] {
  const f: Finding[] = []
  const add = (element: string, severity: Severity, rule: string, message: string) =>
    f.push({ id: `${rule}:${element}:${f.length}`, element, severity, rule, message })
  for (const d of dangling) add(d.element, "error", "Reference", `"${d.value}" in ${d.field} does not exist in the model`)
  const of = (kind: string) => m.elements.filter((e) => e.kind === kind)
  const inc = (id: string) => m.inc.get(id) ?? []
  const incKinds = (id: string) => new Set(inc(id).map((e) => m.byId.get(e.from)?.kind))

  for (const r of of("routes")) {
    const method = String(r.raw.method)
    const path = String(r.raw.path)
    const tables = arr(r.raw.reads).map((t) => m.byId.get(t)).filter(Boolean) as Element[]
    if (!r.raw.permission && !r.raw.public) add(r.id, "error", "Route without permission", "Neither x-permission nor a justified public flag")
    if (r.raw.public === true) add(r.id, "error", "Public without justification", "public needs a text as justification")
    if (!r.raw.module) add(r.id, "error", "Route without module", "Every route belongs to exactly one module")
    if (WRITE.has(method) && method !== "DELETE" && r.raw.request === undefined) add(r.id, "error", "Missing request schema", "A writing route without request fields cannot be validated")
    if (!arr(r.raw.response).length) add(r.id, "error", "Missing response schema", "Without response fields check.contract-response cannot detect data leakage")
    const byName = new Map(tables.flatMap((t) => cols(t).map((c) => [c.name, { ...c, table: t.name }] as const)))
    for (const field of arr(r.raw.response)) {
      const c = byName.get(field)
      if (c?.class === "secret") add(r.id, "error", "Secret field in response", `${field} from ${c.table} is classified as secret`)
      if (c?.class === "financial") add(r.id, "error", "Unprotected financial data", `${field} from ${c.table} is returned unmasked, use ${field}_masked`)
    }
    for (const t of tables) if (cols(t).some((c) => c.class === "secret") && !arr(r.raw.response).length) add(r.id, "warning", "Secret column reachable", `Reads ${t.name} with secret columns, the response schema must exclude them`)
    if (r.raw.public && WRITE.has(method) && !r.raw.signature && !String(r.raw.public).toLowerCase().includes("rate limit"))
      add(r.id, "warning", "Writing public route", "A writing route without login needs a signature or rate limit")
    const sc = routeScopes(m, r)
    if (path.startsWith("/orgs/") && !r.raw.public && !sc.some((x) => ["org", "service", "platform"].includes(x))) add(r.id, "error", "Scope does not match path", "Route under /orgs/{org}, but no org role has the permission")
    if (path.startsWith("/me") && sc.some((x) => ["org", "platform", "service"].includes(x))) add(r.id, "error", "Scope does not match path", "/me route with org or platform permission")
    if (path.startsWith("/admin") && !sc.every((x) => x === "platform")) add(r.id, "error", "Scope does not match path", "/admin route must have platform scope")
    if (WRITE.has(method)) for (const t of tables) if (t.raw.owner && t.raw.owner !== r.raw.module && t.id !== "tbl.audit_event") add(r.id, "warning", "Writes foreign table", `${t.name} belongs to ${m.byId.get(String(t.raw.owner))?.name}, access only via its service or job`)
    if (WRITE.has(method) && !r.raw.idempotency) add(r.id, "error", "Missing idempotency", "A writing route without an idempotency key or natural idempotency")
    const isWebhook = arr(r.raw.callers).some((c) => m.byId.get(c)?.kind === "externals")
    if (isWebhook && (!r.raw.signature || !r.raw.replay_window)) add(r.id, "error", "Unsecured webhook", "A webhook needs a signature secret and a replay window")
  }

  for (const a of of("apps")) {
    const k = String(a.raw.kind)
    if ((k === "client" || k === "web") && !["web", "ios", "android"].includes(String(a.raw.client)))
      add(a.id, "error", "Missing client type", "Apps of kind client or web need client: web, ios or android")
  }

  const retention = new Set(of("jobs").flatMap((j) => arr(j.raw.covers)))
  const exports = new Set(of("jobs").flatMap((j) => arr(j.raw.exports)))
  for (const t of of("tables")) {
    const c = cols(t)
    const personal = c.some((x) => x.class === "personal" || x.class === "financial")
    if (!t.raw.rls) add(t.id, "error", "Table without RLS", "Every table needs an RLS rule")
    if (!t.raw.owner) add(t.id, "error", "Table without owner", "Every table belongs to exactly one module")
    if (!t.raw.retention) add(t.id, "warning", "No retention period", "Retention period is missing")
    if (personal && !incKinds(t.id).has("processing")) add(t.id, "warning", "No processing activity", "Personal-data table is not assigned to a processing activity in legal.yaml")
    if (personal && !retention.has(t.id)) add(t.id, "error", "Not in deletion job", "Personal-data table is not covered by any deletion job")
    if (c.some((x) => x.class === "personal") && !exports.has(t.id) && t.id !== "tbl.audit_event") add(t.id, "warning", "Not in data export", "Personal-data table is missing from the data subject access export")
    if (!incKinds(t.id).has("routes") && !incKinds(t.id).has("jobs")) add(t.id, "warning", "Table without access", "No route or job reads or writes it")
  }

  const granted = new Set(of("roles").flatMap((r) => arr(r.raw.grants)))
  for (const p of of("permissions")) {
    if (!granted.has(p.id)) add(p.id, "warning", "Permission without role", "No role grants this permission")
    if (p.raw.sensitive && !p.raw.audited) add(p.id, "error", "Sensitive without audit", "A sensitive permission must be audited")
    if (p.raw.sensitive && !p.raw.step_up) add(p.id, "info", "Sensitive without step-up", "No repeated two-factor check")
    if (!incKinds(p.id).has("routes")) add(p.id, "warning", "Unused permission", "No route requires this permission")
  }

  for (const e of of("externals")) {
    if (e.raw.country === "US" && arr(e.raw.data).includes("class.personal")) add(e.id, "warning", "Third country", "Personal data sent to a US provider: check legal basis and DPF")
    if (String(e.raw.host).includes("TBD") || e.raw.host === "open") add(e.id, "info", "Open", `Host still open: ${e.raw.host}`)
    if (e.raw.subprocessor && !incKinds(e.id).has("agreements")) add(e.id, "warning", "Subprocessor without DPA", "No data processing agreement in legal.yaml")
    for (const k of ["timeout", "retry", "fallback"]) if (!e.raw[k]) add(e.id, "warning", "Missing resilience", `${k} is not defined`)
  }

  for (const j of of("jobs")) {
    if (!j.raw.idempotent) add(j.id, "error", "Job not idempotent", "The job queue may run jobs more than once")
    if (!j.raw.max_attempts) add(j.id, "warning", "No attempt limit", "max_attempts is missing")
    if (!j.raw.alert) add(j.id, "warning", "Job without alert", "A failure goes unnoticed")
  }
  for (const a of of("alerts")) if (!a.raw.runbook) add(a.id, "warning", "Alert without runbook", "Nobody knows what to do on this alert")

  for (const t of of("threats")) if (!arr(t.raw.mitigated_by).length) add(t.id, "error", "Threat without mitigation", "No control assigned")
  for (const c of of("controls")) if (!c.raw.check) add(c.id, "info", "Control without check", "Rule is not enforced automatically")
  const usedChecks = new Set(m.edges.filter((e) => m.byId.get(e.to)?.kind === "checks").map((e) => e.to))
  for (const c of of("checks")) if (!usedChecks.has(c.id)) add(c.id, "info", "Orphaned check", "No feature, control or release uses it")
  for (const ft of of("features")) if (!arr(ft.raw.checks).length) add(ft.id, "warning", "Feature without check", "Done cannot be proven")
  for (const sc of of("screens")) if (!arr(sc.raw.routes).length) add(sc.id, "warning", "Screen without route", "Screen calls no route")

  const STRIDE = ["spoofing", "tampering", "repudiation", "information_disclosure", "denial_of_service", "elevation_of_privilege"]
  for (const fl of of("flows")) {
    const st = (fl.raw.stride ?? {}) as Record<string, string>
    const missing = STRIDE.filter((k) => !st[k])
    if (missing.length) add(fl.id, "warning", "Incomplete STRIDE", `Unanswered: ${missing.join(", ")}`)
  }

  for (const st of of("steps")) {
    if (!arr(st.raw.goals).length) add(st.id, "error", "Step without goal", "Every step must serve at least one goal")
    if (!st.raw.gate) add(st.id, "error", "Step without gate", "Without a measurable gate, done cannot be verified")
    if (!st.raw.guards || st.raw.guards === "none") add(st.id, "warning", "Step without guardrail", "What prevents the problem from coming back?")
  }
  for (const g of of("goals")) if (!arr(g.raw.metrics).length) add(g.id, "warning", "Goal without metric", "Goal is not measurable")
  for (const g of of("goals")) if (!incKinds(g.id).has("steps")) add(g.id, "warning", "Goal without step", "No step works toward this goal")
  for (const mod of of("modules")) if (!["routes", "jobs"].some((k) => incKinds(mod.id).has(k))) add(mod.id, "info", "Module without entry point", "No route or job belongs to this module")
  for (const s of of("secrets")) if (!s.raw.store) add(s.id, "error", "Secret without store", "Storage location is missing")
  return f
}

export function rolesForPermission(m: Model, perm: string) {
  return m.elements.filter((e) => e.kind === "roles" && ((e.raw.grants as string[]) ?? []).includes(perm))
}

export function releaseStatus(m: Model, id: string) {
  const r = m.byId.get(id)
  if (!r) throw new Error(`Unknown release ${id}`)
  const of = (kind: string) => m.elements.filter((e) => e.kind === kind)
  const sliceRel = (e: Element) => (e.raw.release ? String(e.raw.release) : e.raw.slice ? String(m.byId.get(String(e.raw.slice))?.raw.release ?? "") : "")
  const feats = of("features").filter((f) => sliceRel(f) === id)
  const todos = of("offline").filter((t) => t.raw.release === id)
  const requires = arr(r.raw.requires).map((x) => m.byId.get(x)).filter(Boolean) as Element[]
  const scope = new Set([...feats, ...todos].map((e) => e.id))
  for (const f of feats) for (const x of m.out.get(f.id) ?? []) scope.add(x.to)
  const findings = m.findings.filter((f) => scope.has(f.element) && f.severity !== "info")
  const open = feats.filter((f) => f.status !== "verified")
  const blockers = [...requires, ...todos].filter((x) => x.status !== "verified")
  const errors = findings.filter((f) => f.severity === "error")
  return { release: r, feats, open, blockers, findings, errors, ready: !open.length && !blockers.length && !errors.length }
}
