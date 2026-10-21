import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { model } from "@/model"
import { KINDS, SECTIONS, sectionOfKind } from "@/model/kinds"
import { rolesForPermission, type Element, type Severity } from "@/model/core"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FindingCount, Method, Mono, SEV, StatusDot } from "./bits"
import { ClassChip } from "./Inspector"
import { useLens } from "@/lib/lens"

type P = { sel: string | null; onSelect: (id: string) => void }

const fOf = (id: string) => model.findings.filter((f) => f.element === id && f.severity !== "info")
const of = (kind: string) => model.elements.filter((e) => e.kind === kind)

function Row({ e, sel, onSelect, children }: { e: Element; children: React.ReactNode } & P) {
  const lens = useLens()
  return (
    <tr onClick={() => onSelect(e.id)} className={cn("cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50", sel === e.id && "bg-accent", lens && !lens.has(e.id) && "opacity-30")}>
      {children}
    </tr>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const td = "px-3 py-2 align-top"
const name = (id: unknown) => (id ? model.byId.get(String(id))?.name ?? String(id) : "")

export function RoutesView({ sel, onSelect }: P) {
  const routes = of("routes")
  const byMod = groupBy(routes, (r) => String(r.raw.module))
  return (
    <div className="space-y-6">
      {Object.entries(byMod).map(([mod, rs]) => (
        <div key={mod}>
          <button onClick={() => onSelect(mod)} className="mb-2 text-sm font-semibold hover:text-link">{name(mod)}</button>
          <Table head={["Route", "Access", "Roles", "Callers", "Tables", ""]}>
            {rs.map((r) => {
              const perm = r.raw.permission as string | undefined
              return (
                <Row key={r.id} e={r} sel={sel} onSelect={onSelect}>
                  <td className={td}><div className="flex items-center"><Method m={String(r.raw.method)} /><span className="font-mono text-xs">{String(r.raw.path)}</span></div></td>
                  <td className={td}>{perm ? <Mono>{perm.replace("perm.", "")}</Mono> : <span className="text-xs text-warn">public · {String(r.raw.public)}</span>}</td>
                  <td className={cn(td, "text-xs text-muted-foreground")}>{perm ? rolesForPermission(model, perm).map((x) => x.name).join(", ") : "all"}</td>
                  <td className={cn(td, "text-xs text-muted-foreground")}>{((r.raw.callers as string[]) ?? []).map(name).join(", ")}</td>
                  <td className={cn(td, "font-mono text-[11px] text-muted-foreground")}>{((r.raw.reads as string[]) ?? []).map(name).join(", ")}</td>
                  <td className={td}><FindingCount findings={fOf(r.id)} /></td>
                </Row>
              )
            })}
          </Table>
        </div>
      ))}
    </div>
  )
}

export function DatabaseView({ sel, onSelect }: P) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
      {of("tables").map((t) => {
        const cols = (t.raw.columns as { name: string; type: string; class: string }[]) ?? []
        return (
          <button key={t.id} onClick={() => onSelect(t.id)} className={cn("overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-sm", sel === t.id && "ring-2 ring-link")}>
            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
              <span className="font-mono text-sm font-semibold">{t.name}</span>
              <span className="ml-auto"><FindingCount findings={fOf(t.id)} /></span>
            </div>
            <div className="divide-y">
              {cols.map((c) => (
                <div key={c.name} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className="flex-1 font-mono">{c.name}</span>
                  <span className="text-muted-foreground">{c.type}</span>
                  <ClassChip c={c.class} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground">
              <span>Module: <span className="text-foreground">{name(t.raw.owner)}</span></span>
              <span>RLS: <span className="text-foreground">{String(t.raw.rls)}</span></span>
              <span>Retention: <span className="text-foreground">{String(t.raw.retention)}</span></span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function RolesView({ sel, onSelect }: P) {
  const roles = of("roles")
  const perms = of("permissions")
  return (
    <div className="space-y-6">
      <div className="overflow-auto rounded-lg border bg-card">
        <table className="text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="sticky left-0 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Permission</th>
              {roles.map((r) => (
                <th key={r.id} className="px-2 py-2 text-xs font-medium">
                  <button onClick={() => onSelect(r.id)} className={cn("hover:text-link", sel === r.id && "text-link")}>{r.name}</button>
                  <div className="text-[10px] font-normal text-muted-foreground">{String(r.raw.scope)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p.id} className={cn("border-b last:border-0", sel === p.id && "bg-accent")}>
                <td className="sticky left-0 bg-card px-3 py-1.5">
                  <button onClick={() => onSelect(p.id)} className="flex items-center gap-2 text-left hover:text-link">
                    {p.name}
                    {p.raw.sensitive ? <span className="rounded border border-amber-500/50 px-1 text-[10px] text-amber-600">sensitive</span> : null}
                    {p.raw.step_up ? <span className="rounded border px-1 text-[10px] text-muted-foreground">2FA</span> : null}
                  </button>
                  <div className="font-mono text-[10px] text-muted-foreground">{p.id.replace("perm.", "")}</div>
                </td>
                {roles.map((r) => (
                  <td key={r.id} className="px-2 py-1.5 text-center">
                    {((r.raw.grants as string[]) ?? []).includes(p.id) ? <span className="inline-block size-2 rounded-full bg-link" /> : <span className="text-muted-foreground/40">·</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <GenericView kinds={["principal_types"]} sel={sel} onSelect={onSelect} />
    </div>
  )
}

export function FlowsView({ sel, onSelect }: P) {
  return (
    <div className="space-y-4">
      {of("flows").map((f) => (
        <Card key={f.id} className={cn("gap-3 py-4", sel === f.id && "ring-2 ring-link")}>
          <CardHeader className="px-4">
            <button onClick={() => onSelect(f.id)} className="text-left">
              <CardTitle className="text-base hover:text-link">{f.name}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{String(f.raw.description ?? "")}</p>
            </button>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-1.5 px-4">
            {((f.raw.steps as string[]) ?? []).map((s, i) => {
              const e = model.byId.get(s)
              return (
                <span key={s + i} className="flex items-center gap-1.5">
                  {i > 0 && <ArrowRight className="size-3 text-muted-foreground" />}
                  <button onClick={() => onSelect(s)} className={cn("flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs hover:border-link", sel === s && "border-link")}>
                    <span className="size-2 rounded-sm" style={{ background: KINDS[e?.kind ?? ""]?.color }} />
                    {e?.name ?? s}
                  </button>
                </span>
              )
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function PlanView({ sel, onSelect }: P) {
  return (
    <div className="space-y-3">
      {of("slices").map((s) => {
        const feats = of("features").filter((f) => f.raw.slice === s.id)
        const mods = of("modules").filter((m) => m.raw.slice === s.id)
        const done = feats.filter((f) => f.status === "verified").length
        return (
          <div key={s.id} className={cn("rounded-lg border bg-card", sel === s.id && "ring-2 ring-link")}>
            <button onClick={() => onSelect(s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="font-semibold">{s.name}</span>
              <span className="text-sm text-muted-foreground">{String(s.raw.description ?? "")}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{done}/{feats.length} verified</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"><span className="block h-full bg-ok" style={{ width: `${feats.length ? (done / feats.length) * 100 : 0}%` }} /></span>
            </button>
            {(feats.length > 0 || mods.length > 0) && (
              <div className="divide-y border-t">
                {feats.map((f) => (
                  <button key={f.id} onClick={() => onSelect(f.id)} className={cn("flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-accent/50", sel === f.id && "bg-accent")}>
                    <StatusDot status={f.status} />
                    {f.name}
                    <span className="ml-auto flex gap-1">
                      {((f.raw.checks as string[]) ?? []).map((c) => <Mono key={c}>{c.replace("check.", "")}</Mono>)}
                    </span>
                  </button>
                ))}
                {mods.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-4 py-2">
                    <span className="text-xs text-muted-foreground">Modules:</span>
                    {mods.map((m) => <button key={m.id} onClick={() => onSelect(m.id)} className="text-xs text-link hover:underline">{m.name}</button>)}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function GenericView({ kinds, sel, onSelect }: { kinds: string[] } & P) {
  return (
    <div className="space-y-6">
      {kinds.map((k) => {
        const els = of(k)
        if (!els.length) return null
        const cols = pickCols(els)
        return (
          <div key={k}>
            {kinds.length > 1 && <div className="mb-2 text-sm font-semibold">{KINDS[k]?.plural}</div>}
            <Table head={["Name", ...cols.map((c) => c.label), "Connections", ""]}>
              {els.map((e) => (
                <Row key={e.id} e={e} sel={sel} onSelect={onSelect}>
                  <td className={td}>
                    <div className="flex items-center gap-2 font-medium"><StatusDot status={e.status} />{e.name}</div>
                    {e.raw.description ? <div className="mt-0.5 line-clamp-2 max-w-xl text-xs text-muted-foreground">{String(e.raw.description)}</div> : null}
                  </td>
                  {cols.map((c) => <td key={c.key} className={cn(td, "text-xs text-muted-foreground")}>{fmt(e.raw[c.key])}</td>)}
                  <td className={cn(td, "text-xs tabular-nums text-muted-foreground")}>{(model.out.get(e.id)?.length ?? 0) + (model.inc.get(e.id)?.length ?? 0)}</td>
                  <td className={td}><FindingCount findings={fOf(e.id)} /></td>
                </Row>
              ))}
            </Table>
          </div>
        )
      })}
    </div>
  )
}

const COL_LABEL: Record<string, string> = { shell: "Shell", module: "Module", country: "Country", host: "Host", basis: "Legal basis", trigger: "Trigger", periodic: "Schedule", provider: "Provider", store: "Store", tool: "Tool", catches: "Catches", stride: "STRIDE", date: "Date", english: "English", app: "App", path: "Path", slice: "Slice", package: "Package", source: "Source", monthly: "Monthly", order: "Order", target: "Target", check: "Check", watches: "Watches", covers: "Covers", scope: "Applies to" }

function pickCols(els: Element[]) {
  const keys = Object.keys(COL_LABEL).filter((k) => els.some((e) => e.raw[k] !== undefined && typeof e.raw[k] !== "object"))
  return keys.slice(0, 3).map((k) => ({ key: k, label: COL_LABEL[k] }))
}

function fmt(v: unknown) {
  if (v === undefined) return ""
  const s = String(v)
  return model.byId.get(s)?.name ?? s
}

export function OverviewView({ onSelect, onSection }: P & { onSection: (s: string) => void }) {
  const count = (sev: Severity) => model.findings.filter((f) => f.severity === sev).length
  const top = model.findings.filter((f) => f.severity !== "info").slice(0, 8)
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Elements in model" value={model.elements.length} />
        <Stat label="Connections" value={model.edges.length} />
        <Stat label="Errors" value={count("error")} tone={count("error") ? "bad" : "ok"} />
        <Stat label="Warnings" value={count("warning")} tone={count("warning") ? "warn" : "ok"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-2 py-4">
          <CardHeader className="px-4"><CardTitle className="text-sm">Areas</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-1 px-2">
            {SECTIONS.filter((s) => s.kinds.length).map((s) => {
              const n = model.elements.filter((e) => s.kinds.includes(e.kind)).length
              return (
                <button key={s.id} onClick={() => onSection(s.id)} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                  <span>{s.label}</span><span className="tabular-nums text-muted-foreground">{n}</span>
                </button>
              )
            })}
          </CardContent>
        </Card>
        <Card className="gap-2 py-4">
          <CardHeader className="flex flex-row items-center justify-between px-4">
            <CardTitle className="text-sm">Top findings</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onSection("findings")}>View all</Button>
          </CardHeader>
          <CardContent className="space-y-1 px-2">
            {top.map((f) => (
              <button key={f.id} onClick={() => onSelect(f.element)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", SEV[f.severity].dot)} />
                <span className="min-w-0">
                  <span className="text-sm font-medium">{f.rule}</span>
                  <span className="block truncate text-xs text-muted-foreground">{model.byId.get(f.element)?.name} · {f.message}</span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
      <PlanView sel={null} onSelect={onSelect} />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "bad" && "text-destructive", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{value}</div>
      </CardContent>
    </Card>
  )
}

export function FindingsView({ sel, onSelect }: P) {
  const [filter, setFilter] = useState<Severity | "all">("all")
  const list = model.findings.filter((f) => filter === "all" || f.severity === filter)
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["all", "error", "warning", "info"] as const).map((s) => (
          <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setFilter(s)}>
            {s === "all" ? "All" : SEV[s].label} · {s === "all" ? model.findings.length : model.findings.filter((f) => f.severity === s).length}
          </Button>
        ))}
      </div>
      <Table head={["", "Rule", "Element", "Area", "Finding"]}>
        {list.map((f) => {
          const e = model.byId.get(f.element)
          return (
            <tr key={f.id} onClick={() => onSelect(f.element)} className={cn("cursor-pointer border-b last:border-0 hover:bg-accent/50", sel === f.element && "bg-accent")}>
              <td className={td}><span className={cn("mt-1 inline-block size-2 rounded-full", SEV[f.severity].dot)} /></td>
              <td className={cn(td, "font-medium")}>{f.rule}</td>
              <td className={td}>{e?.name}</td>
              <td className={cn(td, "text-xs text-muted-foreground")}>{e ? sectionOfKind(e.kind)?.label : ""}</td>
              <td className={cn(td, "text-xs text-muted-foreground")}>{f.message}</td>
            </tr>
          )
        })}
      </Table>
    </div>
  )
}

function groupBy<T>(xs: T[], k: (x: T) => string) {
  const r: Record<string, T[]> = {}
  for (const x of xs) (r[k(x)] ??= []).push(x)
  return r
}
