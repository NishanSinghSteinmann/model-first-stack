import { useEffect, useMemo, useState } from "react"
import { Box, List, Pause, Play, Search, StepForward } from "lucide-react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Layers3D } from "./Layers"
import { model } from "@/model"
import { KINDS } from "@/model/kinds"
import { rolesForPermission, type Element } from "@/model/core"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { Method, Mono, SEV } from "./bits"
import { ClassChip } from "./Inspector"

type P = { sel: string | null; onSelect: (id: string) => void }

type Scope = { key: "public" | "self" | "org" | "platform" | "service"; label: string; cls: string; text: string }

const SCOPES: Record<Scope["key"], Omit<Scope, "key">> = {
  public: { label: "Public", cls: "border-warn/60 text-warn", text: "No token. Only with justification, rate limit or signature." },
  self: { label: "User scope", cls: "border-sky-500/50 text-sky-600", text: "Only the signed-in user's or guest's own data." },
  org: { label: "Org scope", cls: "border-violet-500/50 text-violet-600", text: "Only data of the org in the path, only with membership and role." },
  platform: { label: "Platform", cls: "border-destructive/50 text-destructive", text: "Platform internal, two-factor, audited." },
  service: { label: "Service key", cls: "border-emerald-500/50 text-emerald-600", text: "Machine with API key, bound to exactly one org." },
}

const ids = (v: unknown) => ((Array.isArray(v) ? v : v ? [v] : []) as string[]).map((x) => model.byId.get(x)).filter(Boolean) as Element[]

function scopeOf(r: Element): Scope["key"][] {
  if (r.raw.public) return ["public"]
  const roles = rolesForPermission(model, String(r.raw.permission))
  const s = new Set<Scope["key"]>()
  for (const ro of roles) s.add(ro.raw.principal === "ptype.service" ? "service" : (ro.raw.scope as Scope["key"]))
  return [...s]
}

type Step = { band: string; color: string; title: string; body: React.ReactNode; items: Element[]; tone?: "warn" | "bad" }

function trace(r: Element): Step[] {
  const callers = ids(r.raw.callers)
  const apps = callers.filter((c) => c.kind === "apps")
  const actors = [...model.elements.filter((a) => a.kind === "actors" && ids(a.raw.clients).some((c) => apps.includes(c))), ...callers.filter((x) => x.kind === "actors")]
  const devices = model.elements.filter((d) => d.kind === "devices" && actors.some((a) => ids(a.raw.uses).includes(d)) && (ids(d.raw.runs).some((a) => apps.includes(a)) || callers.some((c) => c.kind === "actors")))
  const perm = r.raw.permission ? model.byId.get(String(r.raw.permission)) : null
  const roles = perm ? rolesForPermission(model, perm.id) : []
  const scopes = scopeOf(r)
  const mod = model.byId.get(String(r.raw.module))
  const tables = ids(r.raw.reads)
  const abstractions = [...ids("abs.principal"), ...(r.raw.public ? [] : ids("abs.scope")), ...ids(r.raw.uses)]
  const jobs = model.elements.filter((j) => j.kind === "jobs" && j.raw.trigger === r.id)
  const jobsDeep = [...jobs, ...model.elements.filter((j) => j.kind === "jobs" && jobs.some((x) => x.id === j.raw.trigger))]
  const externals = [...new Set(jobsDeep.flatMap((j) => ids(j.raw.uses)))]
  const writes = [...new Set(jobsDeep.flatMap((j) => ids(j.raw.writes)))]
  const req = (r.raw.request as string[]) ?? []
  const res = (r.raw.response as string[]) ?? []
  const secretCols = tables.flatMap((t) => ((t.raw.columns as { name: string; class: string }[]) ?? []).filter((c) => c.class === "secret").map((c) => `${t.name}.${c.name}`))
  const isWebhook = callers.some((c) => c.kind === "externals")
  const shell = (id: string) => model.byId.get(id)
  const steps: Step[] = []
  if (actors.length) steps.push({ band: "Actor", color: KINDS.actors.color, title: actors.map((a) => a.name).join(", "), body: "Who triggers the request.", items: actors })
  if (devices.length) steps.push({ band: "Device", color: KINDS.devices.color, title: devices.map((d) => d.name).join(", "), body: "What the client runs on.", items: devices })
  steps.push({
    band: "Client", color: KINDS.apps.color, title: callers.map((c) => c.name).join(", "),
    body: <>Sends <Method m={String(r.raw.method)} /><Mono>{String(r.raw.path)}</Mono> to the API{isWebhook ? " as a webhook" : ""}.</>,
    items: callers,
  })
  steps.push({ band: "① Edge", color: KINDS.shells.color, title: "Edge proxy", body: "TLS, size and rate limits, WAF. Everything else is dropped here.", items: [...ids(shell("shell.edge")?.raw.controls)] })
  steps.push({
    band: "② Request", color: KINDS.shells.color,
    title: r.raw.public ? (isWebhook ? "Signature instead of token" : "No token") : "Token → principal",
    body: (
      <div className="space-y-2">
        <div>{r.raw.public ? (isWebhook ? "Webhook signature is verified against the secret, otherwise 401." : `Justification: ${r.raw.public}`) : "The JWT is verified against the JWKS and resolved to a principal (user, guest, staff or service). Invalid → 401."}</div>
        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">Request fields · validated against OpenAPI, unknown fields → 400</div>
          {req.length ? <div className="flex flex-wrap gap-1">{req.map((f) => <Mono key={f}>{f}</Mono>)}</div> : <span className="text-xs text-muted-foreground">{["GET", "DELETE"].includes(String(r.raw.method)) ? "Path parameters only." : "Not defined in the model yet."}</span>}
        </div>
      </div>
    ),
    items: ids(shell("shell.request")?.raw.controls),
    tone: !req.length && !["GET", "DELETE"].includes(String(r.raw.method)) ? "warn" : undefined,
  })
  steps.push({
    band: "③ Access", color: KINDS.shells.color,
    title: perm ? perm.name : "Public, no permission",
    body: (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">{scopes.map((s) => <span key={s} className={cn("rounded-md border px-2 py-0.5 text-xs font-medium", SCOPES[s].cls)}>{SCOPES[s].label}</span>)}</div>
        <div>{scopes.map((s) => SCOPES[s].text).join(" ")}</div>
        {perm && <div>Allowed for: {roles.map((x) => x.name).join(", ") || "nobody"}. Everyone else → 403, foreign org → 404.</div>}
        {perm?.raw.step_up ? <div className="text-warn">Two-factor is asked again.</div> : null}
        {perm?.raw.delay ? <div className="text-warn">Effective only after {String(perm.raw.delay)}.</div> : null}
        {perm?.raw.notify ? <div>Notifies: {ids(perm.raw.notify).map((x) => x.name).join(", ")}.</div> : null}
      </div>
    ),
    items: [r, ...(perm ? [perm] : []), ...roles],
    tone: r.raw.public ? "warn" : undefined,
  })
  steps.push({ band: "④ Business logic", color: KINDS.modules.color, title: mod?.name ?? "no module", body: "Validated types only, no HTTP, no SQL.", items: [...(mod ? [mod] : []), ...abstractions] })
  steps.push({
    band: "⑤ Data", color: KINDS.tables.color, title: tables.length ? tables.map((t) => t.name).join(", ") : "no DB access",
    body: tables.length ? (
      <div className="space-y-2">
        {tables.map((t) => (
          <div key={t.id} className="rounded-md border">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-2 py-1 text-xs"><span className="font-mono font-medium">{t.name}</span><span className="ml-auto text-muted-foreground">RLS: {String(t.raw.rls)}</span></div>
            <div className="flex flex-wrap gap-1 p-2">
              {((t.raw.columns as { name: string; class: string }[]) ?? []).map((c) => (
                <span key={c.name} className="inline-flex items-center gap-1 text-[11px]"><span className="font-mono">{c.name}</span><ClassChip c={c.class} /></span>
              ))}
            </div>
          </div>
        ))}
        <div className="text-xs text-muted-foreground">Every query receives the scope; RLS additionally enforces it in the database.</div>
      </div>
    ) : null,
    items: tables,
  })
  if (jobsDeep.length || externals.length)
    steps.push({
      band: "⑥ Outbound · async", color: KINDS.externals.color, title: jobsDeep.map((j) => j.name).join(", "),
      body: <>Jobs are enqueued in the same transaction and run in the worker. {externals.length ? <>Targets: {externals.map((e) => `${e.name} (${e.raw.country})`).join(", ")}.</> : null} {writes.length ? <>Writes: {writes.map((w) => w.name).join(", ")}.</> : null}</>,
      items: [...jobsDeep, ...externals],
    })
  if (perm?.raw.sensitive) steps.push({ band: "Audit", color: KINDS.modules.color, title: "audit_event", body: "Sensitive action: who, what, when, on what. Append-only.", items: ids("tbl.audit_event") })
  steps.push({
    band: "Response", color: KINDS.apps.color, title: res.length ? `${res.length} fields` : "Response schema missing",
    body: (
      <div className="space-y-2">
        {res.length ? <div className="flex flex-wrap gap-1">{res.map((f) => <Mono key={f}>{f}</Mono>)}</div> : <div className="text-xs">Not in the model yet. Without a schema, check.contract-response cannot verify that too much is not returned.</div>}
        {secretCols.length > 0 && <div className="text-xs">Never in the response: {secretCols.map((c) => <Mono key={c} className="mr-1 text-destructive">{c}</Mono>)}</div>}
      </div>
    ),
    items: [],
    tone: res.length ? undefined : "warn",
  })
  return steps
}

export function RequestsView({ sel, onSelect }: P) {
  const routes = model.elements.filter((e) => e.kind === "routes")
  const [q, setQ] = useState("")
  const [routeId, setRouteId] = useState<string | null>(sel && model.byId.get(sel)?.kind === "routes" ? sel : null)
  useEffect(() => { if (sel && model.byId.get(sel)?.kind === "routes") setRouteId(sel) }, [sel])
  const route = routes.find((r) => r.id === routeId) ?? null
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState<"list" | "3d">("list")
  const steps = useMemo(() => (route ? trace(route) : []), [route])
  const traceIds = useMemo(() => steps.map((st) => ({ ids: st.items.map((i) => i.id) })), [steps])
  useEffect(() => { setActive(0); setPlaying(false) }, [route?.id])
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => setActive((a) => { if (a >= steps.length - 1) { setPlaying(false); return a } return a + 1 }), 900)
    return () => clearInterval(t)
  }, [playing, steps.length])
  const list = routes.filter((r) => !q || `${r.raw.method} ${r.raw.path} ${r.name}`.toLowerCase().includes(q.toLowerCase()))
  const findings = route ? model.findings.filter((f) => f.element === route.id) : []
  return (
    <div className="absolute inset-0 flex">
      <div className="flex w-80 shrink-0 flex-col border-r">
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search routes…" className="h-8 pl-8 text-xs" />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-2 pb-3">
            {list.map((r) => {
              const sc = scopeOf(r)
              return (
                <button key={r.id} onClick={() => onSelect(r.id)} className={cn("flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left hover:bg-accent", routeId === r.id && "bg-accent")}>
                  <span className="flex items-center"><Method m={String(r.raw.method)} /><span className="truncate font-mono text-[11px]">{String(r.raw.path)}</span></span>
                  <span className="flex gap-1 pl-14">{sc.map((s) => <span key={s} className={cn("rounded border px-1 text-[10px]", SCOPES[s].cls)}>{SCOPES[s].label}</span>)}</span>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-6">
        {!route ? (
          <div className="text-sm text-muted-foreground">Select a route on the left to see which layers the request passes through, which fields it carries, which scope applies, which tables and services it touches, and what comes back.</div>
        ) : (
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center text-lg font-semibold"><Method m={String(route.raw.method)} /><span className="font-mono">{String(route.raw.path)}</span></div>
                <div className="mt-1 flex flex-wrap gap-1.5">{scopeOf(route).map((s) => <span key={s} className={cn("rounded-md border px-2 py-0.5 text-xs font-medium", SCOPES[s].cls)}>{SCOPES[s].label}</span>)}</div>
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={() => { if (active >= steps.length - 1) setActive(0); setPlaying(!playing) }}>
                {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}{playing ? "Pause" : "Play"}
              </Button>
              <Button variant="outline" size="icon" className="size-8" onClick={() => setActive((a) => Math.min(a + 1, steps.length - 1))}><StepForward className="size-3.5" /></Button>
              <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as "list" | "3d")}>
                <ToggleGroupItem value="list" className="gap-1.5 px-3 text-xs"><List className="size-3.5" />List</ToggleGroupItem>
                <ToggleGroupItem value="3d" className="gap-1.5 px-3 text-xs"><Box className="size-3.5" />3D</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {view === "3d" && (
              <div className="relative mt-4 h-[640px] overflow-hidden rounded-lg border">
                <Layers3D sel={null} onSelect={onSelect} trace={traceIds} active={active} />
                <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-background/90 px-3 py-2 text-xs backdrop-blur">
                  <div className="font-medium">Step {active + 1} of {steps.length} · {steps[active]?.band}</div>
                  <div className="text-muted-foreground">{steps[active]?.title}</div>
                </div>
              </div>
            )}
            {findings.length > 0 && (
              <div className="mt-4 space-y-1.5">
                {findings.map((f) => <div key={f.id} className={cn("rounded-md border px-3 py-2 text-xs", SEV[f.severity].cls)}><span className="font-medium">{f.rule}:</span> {f.message}</div>)}
              </div>
            )}
            <ol className={cn("relative mt-6", view === "3d" && "hidden")}>
              {steps.map((s, i) => (
                <li key={i} className="relative flex gap-4 pb-4" onClick={() => setActive(i)}>
                  {i < steps.length - 1 && <span className={cn("absolute left-[15px] top-8 h-[calc(100%-1rem)] w-0.5 transition-colors", i < active ? "bg-link" : "bg-border")} />}
                  <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background text-xs font-semibold tabular-nums transition-all", i === active ? "scale-110 border-link bg-link text-white" : i < active ? "border-link text-link" : "text-muted-foreground")}>{i + 1}</span>
                  <div className={cn("min-w-0 flex-1 cursor-pointer rounded-lg border bg-card p-3 transition-all", i === active && "ring-2 ring-link", s.tone === "warn" && "border-warn/60", i > active && "opacity-60")}>
                    <div className="flex items-center gap-2">
                      <span className="h-3.5 w-1 rounded-full" style={{ background: s.color }} />
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.band}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold">{s.title}</div>
                    {s.body && <div className="mt-1.5 text-sm text-muted-foreground">{s.body}</div>}
                    {s.items.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.items.map((e) => (
                          <button key={e.id} onClick={(ev) => { ev.stopPropagation(); onSelect(e.id) }} className="inline-flex items-center gap-1.5 rounded-md border bg-background px-1.5 py-0.5 text-[11px] hover:border-link">
                            <span className="size-1.5 rounded-full" style={{ background: KINDS[e.kind]?.color }} />{e.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
