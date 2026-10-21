import { useEffect, useState } from "react"
import { Shield, Trash2, Wand2 } from "lucide-react"
import { model } from "@/model"
import type { Element } from "@/model/core"
import { cn } from "@/lib/utils"

type P = { sel: string | null; onSelect: (id: string) => void }
type M = { id: string; name: string; baseline: number; target: number; current: number | null; progress: number | null; note?: string }

const of = (k: string) => model.elements.filter((e) => e.kind === k)
const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : v ? [String(v)] : [])
const fmt = (n: number | null) => (n === null ? "–" : n.toLocaleString("en-US"))

export function useMetrics() {
  const [m, setM] = useState<Record<string, M>>({})
  useEffect(() => {
    fetch("/api/metrics").then((r) => (r.ok ? r.json() : [])).then((xs: M[]) => setM(Object.fromEntries(xs.map((x) => [x.id, x])))).catch(() => {})
  }, [])
  return m
}

function Line({ icon: Icon, label, text }: { icon: typeof Trash2; label: string; text: unknown }) {
  if (!text || text === "none") return null
  return (
    <div className="flex gap-2 text-xs">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span><span className="text-muted-foreground">{label}: </span>{String(text)}</span>
    </div>
  )
}

async function saveStatus(id: string, status: string) {
  await fetch("/api/status", { method: "POST", body: JSON.stringify({ id, status }) })
}

export function FocusView({ sel }: P) {
  const metrics = useMetrics()
  const phases = of("phases").sort((a, b) => Number(a.raw.order) - Number(b.raw.order))
  const steps = phases.flatMap((p) => of("steps").filter((s) => s.raw.phase === p.id))
  const firstOpen = Math.max(0, steps.findIndex((s) => s.status !== "verified"))
  const fromSel = sel ? steps.findIndex((x) => x.id === sel) : -1
  const [idx, setIdx] = useState(fromSel >= 0 ? fromSel : firstOpen)
  useEffect(() => { if (fromSel >= 0) setIdx(fromSel) }, [fromSel])
  const [details, setDetails] = useState(false)
  const s = steps[idx]
  if (!s) return <div className="py-10 text-center text-sm text-muted-foreground">No steps defined yet.</div>
  const phase = model.byId.get(String(s.raw.phase))!
  const goals = arr(s.raw.goals).map((id) => model.byId.get(id)).filter(Boolean) as Element[]
  const gateMetrics = [...String(s.raw.gate ?? "").matchAll(/metric\.[a-z0-9-]+/g)].map((x) => metrics[x[0]]).filter(Boolean)
  const verified = s.status === "verified"
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-2">
      <div className="flex items-start gap-1">
        {phases.map((p) => {
          const ps = steps.filter((x) => x.raw.phase === p.id)
          const active = p.id === phase.id
          return (
            <div key={p.id} className="min-w-0 flex-1">
              <div className="flex gap-1">
                {ps.map((x) => {
                  const i = steps.indexOf(x)
                  return (
                    <button key={x.id} title={x.name} onClick={() => setIdx(i)} className={cn("h-2 flex-1 rounded-full transition-colors", x.status === "verified" ? "bg-ok" : i === idx ? "bg-link" : x.status === "wip" ? "bg-link/40" : "bg-muted hover:bg-muted-foreground/30")} />
                  )
                })}
              </div>
              <div className={cn("mt-2 truncate text-[11px]", active ? "font-medium text-foreground" : "text-muted-foreground")}>{p.name}</div>
            </div>
          )
        })}
      </div>

      <div>
        <div className="text-xs font-medium text-link">Step {idx + 1} of {steps.length} · {phase.name}</div>
        <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight">{s.name}</h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{String(s.raw.output ?? "")}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {goals.map((g) => <span key={g.id} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">{g.name}</span>)}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Done when</div>
        <div className="mt-1 text-base font-medium">{String(s.raw.gate ?? "")}</div>
        {gateMetrics.length > 0 && (
          <div className="mt-4 space-y-3">
            {gateMetrics.map((m) => (
              <div key={m.id}>
                <div className="flex items-baseline justify-between text-sm"><span>{m.name}</span><span className="tabular-nums text-muted-foreground">{fmt(m.current)} → {fmt(m.target)}</span></div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-ok transition-all" style={{ width: `${(m.progress ?? 0) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <button onClick={() => setDetails(!details)} className="text-sm text-link hover:underline">{details ? "Show less" : "What goes away, what is generated, which guardrail?"}</button>
        {details && (
          <div className="mt-3 space-y-2 rounded-xl border bg-card p-4">
            <Line icon={Trash2} label="Removed" text={s.raw.deletes} />
            <Line icon={Wand2} label="Generated" text={s.raw.generates} />
            <Line icon={Shield} label="Guardrail" text={s.raw.guards} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t pt-5">
        <button disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="rounded-md border px-4 py-2 text-sm disabled:opacity-40">Back</button>
        <div className="flex-1" />
        <button onClick={() => saveStatus(s.id, verified ? "wip" : "verified")} className={cn("rounded-md px-4 py-2 text-sm font-medium", verified ? "border text-muted-foreground" : "bg-ok text-white")}>
          {verified ? "Reopen" : "Mark step done"}
        </button>
        <button disabled={idx === steps.length - 1} onClick={() => setIdx(idx + 1)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40">Next</button>
      </div>
    </div>
  )
}

export function TimelineView() {
  const metrics = useMetrics()
  const goals = of("goals")
  const phases = of("phases").sort((a, b) => Number(a.raw.order) - Number(b.raw.order))
  const steps = phases.flatMap((p) => of("steps").filter((s) => s.raw.phase === p.id))
  const current = steps.find((s) => s.status !== "verified")?.id
  const goalPct = (g: Element) => {
    const ps = arr(g.raw.metrics).map((id) => metrics[id]?.progress).filter((x): x is number => typeof x === "number")
    return ps.length ? Math.round((ps.reduce((a, b) => a + b, 0) / ps.length) * 100) : 0
  }
  const open = (id: string) => { location.hash = `/roadmap/${encodeURIComponent(id)}` }
  return (
    <div className="mx-auto max-w-2xl py-2">
      <div className="mb-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {goals.map((g) => (
          <span key={g.id} className="flex items-center gap-2 text-muted-foreground">
            <span className="tabular-nums font-semibold text-foreground">{goalPct(g)} %</span>{g.name}
          </span>
        ))}
      </div>
      <ol className="relative">
        <span className="absolute bottom-2 left-[7px] top-2 w-px bg-border" />
        {phases.map((p) => {
          const ps = steps.filter((s) => s.raw.phase === p.id)
          const done = ps.filter((s) => s.status === "verified").length
          const allDone = done === ps.length
          return (
            <li key={p.id} className="relative mb-10 pl-10">
              <span className={cn("absolute left-0 top-1 size-[15px] rounded-full border-2 bg-background", allDone ? "border-ok bg-ok" : ps.some((s) => s.id === current) ? "border-link" : "border-muted-foreground/40")} />
              <div className="flex items-baseline gap-3">
                <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                <span className="text-xs tabular-nums text-muted-foreground">{done}/{ps.length}</span>
              </div>
              <ul className="mt-3 space-y-1">
                {ps.map((s) => {
                  const isCur = s.id === current
                  const ok = s.status === "verified"
                  return (
                    <li key={s.id}>
                      <button onClick={() => open(s.id)} className={cn("group flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent", isCur && "bg-link/5")}>
                        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", ok ? "bg-ok" : isCur ? "bg-link" : "bg-muted-foreground/30")} />
                        <span className={cn("flex-1 text-sm", ok && "text-muted-foreground line-through", isCur && "font-medium")}>{s.name}</span>
                        {isCur && <span className="text-[11px] font-medium text-link">now</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
