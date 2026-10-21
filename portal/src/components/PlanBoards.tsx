import { useState } from "react"
import { CalendarDays, CircleCheck, Lock } from "lucide-react"
import { model } from "@/model"
import type { Element, Status } from "@/model/core"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FindingCount, KindBadge, Mono, StatusDot } from "./bits"

type P = { sel: string | null; onSelect: (id: string) => void }

const of = (kind: string) => model.elements.filter((e) => e.kind === kind)
const releaseOf = (e: Element) => {
  if (e.raw.release) return String(e.raw.release)
  const s = e.raw.slice ? model.byId.get(String(e.raw.slice)) : null
  return s?.raw.release ? String(s.raw.release) : null
}

const COLUMNS: { status: Status; label: string }[] = [
  { status: "planned", label: "Planned" },
  { status: "wip", label: "In progress" },
  { status: "built", label: "Built" },
  { status: "verified", label: "Verified" },
]

async function saveStatus(id: string, status: Status) {
  const r = await fetch("/api/status", { method: "POST", body: JSON.stringify({ id, status }) })
  if (!r.ok) throw new Error(await r.text())
}

export function KanbanView({ sel, onSelect }: P) {
  const releases = of("releases")
  const [rel, setRel] = useState<string>("all")
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<Status | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [kinds, setKinds] = useState<string[]>(["features", "offline"])
  const KINDSET = [{ k: "features", l: "Features" }, { k: "offline", l: "Non-code" }, { k: "steps", l: "Roadmap steps" }]
  const items = kinds.flatMap((k) => of(k)).filter((e) => rel === "all" || releaseOf(e) === rel)
  const drop = async (status: Status) => {
    setOver(null)
    if (!drag) return
    try {
      await saveStatus(drag, status)
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
    setDrag(null)
  }
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={rel === "all" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setRel("all")}>All</Button>
        {releases.map((r) => (
          <Button key={r.id} variant={rel === r.id ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setRel(r.id)}>{r.name}</Button>
        ))}
        <span className="mx-2 h-5 w-px bg-border" />
        {KINDSET.map((x) => (
          <Button key={x.k} variant={kinds.includes(x.k) ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setKinds(kinds.includes(x.k) ? kinds.filter((k) => k !== x.k) : [...kinds, x.k])}>{x.l}</Button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">Dragging changes the status in architecture/*.yaml</span>
      </div>
      {err && <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{err}</div>}
      <div className="grid min-h-0 flex-1 grid-cols-4 gap-4">
        {COLUMNS.map((c) => {
          const cards = items.filter((e) => (e.status === "later" ? "planned" : e.status) === c.status)
          return (
            <div
              key={c.status}
              onDragOver={(ev) => { ev.preventDefault(); setOver(c.status) }}
              onDragLeave={() => setOver(null)}
              onDrop={() => drop(c.status)}
              className={cn("flex min-h-0 flex-col rounded-lg border bg-muted/30 transition-colors", over === c.status && "border-link bg-link/5")}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <StatusDot status={c.status} />
                <span className="text-sm font-medium">{c.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{cards.length}</span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-auto px-2 pb-2">
                {cards.map((e) => {
                  const slice = e.raw.slice ? model.byId.get(String(e.raw.slice)) : null
                  const checks = (e.raw.checks as string[]) ?? []
                  const r = releaseOf(e)
                  return (
                    <div
                      key={e.id}
                      draggable
                      onDragStart={() => setDrag(e.id)}
                      onClick={() => onSelect(e.id)}
                      className={cn("cursor-grab rounded-md border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm active:cursor-grabbing", sel === e.id && "ring-2 ring-link", drag === e.id && "opacity-50")}
                    >
                      <div className="text-sm font-medium leading-snug">{e.name}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {e.kind !== "features" ? <KindBadge kind={e.kind} /> : slice && <span className="text-[11px] text-muted-foreground">{slice.name}</span>}
                        {r && <span className="rounded border px-1.5 text-[10px] text-muted-foreground">{model.byId.get(r)?.name.split(" · ")[0]}</span>}
                        <span className="ml-auto"><FindingCount findings={model.findings.filter((f) => f.element === e.id && f.severity !== "info")} /></span>
                      </div>
                      {checks.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">{checks.map((x) => <Mono key={x} className="text-[10px]">{x.replace("check.", "")}</Mono>)}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ReleasesView({ sel, onSelect }: P) {
  return (
    <div className="space-y-5">
      {of("releases").map((r) => {
        const slices = of("slices").filter((s) => s.raw.release === r.id)
        const feats = of("features").filter((f) => releaseOf(f) === r.id)
        const todos = of("offline").filter((t) => t.raw.release === r.id)
        const requires = ((r.raw.requires as string[]) ?? []).map((id) => model.byId.get(id)).filter(Boolean) as Element[]
        const gates = ((r.raw.gates as string[]) ?? []).map((id) => model.byId.get(id)).filter(Boolean) as Element[]
        const scope = new Set([...feats, ...slices, ...todos].map((e) => e.id))
        for (const f of feats) for (const x of model.out.get(f.id) ?? []) scope.add(x.to)
        const findings = model.findings.filter((f) => scope.has(f.element) && f.severity !== "info")
        const done = feats.filter((f) => f.status === "verified").length
        const blockers = [...requires.filter((x) => x.status !== "verified"), ...todos.filter((t) => t.status !== "verified")]
        const ready = done === feats.length && !blockers.length && !findings.some((f) => f.severity === "error")
        return (
          <Card key={r.id} className={cn("gap-4 py-5", sel === r.id && "ring-2 ring-link")}>
            <CardHeader className="px-5">
              <div className="flex items-start gap-4">
                <button onClick={() => onSelect(r.id)} className="min-w-0 flex-1 text-left">
                  <CardTitle className="text-lg hover:text-link">{r.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{String(r.raw.description ?? "")}</p>
                </button>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" />{String(r.raw.date ?? "")}</span>
                  <span className={cn("flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium", ready ? "border-ok/50 text-ok" : "text-muted-foreground")}>
                    {ready ? <CircleCheck className="size-3.5" /> : <Lock className="size-3.5" />}{ready ? "release ready" : "blocked"}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-ok transition-all" style={{ width: `${feats.length ? (done / feats.length) * 100 : 0}%` }} /></div>
                <span className="text-xs tabular-nums text-muted-foreground">{done}/{feats.length} features verified</span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 px-5 lg:grid-cols-3">
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Slices and features</div>
                {slices.map((s) => (
                  <div key={s.id} className="mb-2">
                    <button onClick={() => onSelect(s.id)} className="text-sm font-medium hover:text-link">{s.name}</button>
                    {feats.filter((f) => f.raw.slice === s.id).map((f) => (
                      <button key={f.id} onClick={() => onSelect(f.id)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                        <StatusDot status={f.status} />{f.name}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Gates</div>
                <div className="flex flex-wrap gap-1.5">
                  {gates.map((g) => <button key={g.id} onClick={() => onSelect(g.id)} className="rounded-md border px-2 py-1 text-xs hover:border-link">{g.name}</button>)}
                </div>
                {blockers.length > 0 && (
                  <>
                    <div className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Open prerequisites</div>
                    {blockers.map((b) => (
                      <button key={b.id} onClick={() => onSelect(b.id)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-accent">
                        <Lock className="size-3 text-muted-foreground" />{b.name}
                      </button>
                    ))}
                  </>
                )}
              </div>
              <div>
                <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Findings in scope · {findings.length}</div>
                {findings.slice(0, 8).map((f) => (
                  <button key={f.id} onClick={() => onSelect(f.element)} className="flex w-full items-start gap-2 rounded px-1 py-1 text-left hover:bg-accent">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", f.severity === "error" ? "bg-destructive" : "bg-warn")} />
                    <span className="min-w-0 text-xs"><span className="font-medium">{f.rule}</span><span className="block truncate text-muted-foreground">{model.byId.get(f.element)?.name}</span></span>
                  </button>
                ))}
                {!findings.length && <div className="text-sm text-muted-foreground">None.</div>}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
