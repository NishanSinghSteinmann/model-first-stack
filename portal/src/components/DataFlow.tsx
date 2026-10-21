import { useMemo, useState } from "react"
import { sankey, sankeyLinkHorizontal, type SankeyGraph } from "d3-sankey"
import { model } from "@/model"
import { KINDS } from "@/model/kinds"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type P = { sel: string | null; onSelect: (id: string) => void }
type N = { id: string; name: string; color: string }
type L = { source: string; target: string; value: number; cls: string }

const CLASSES = [
  { id: "personal", label: "personal", color: "#8b5cf6" },
  { id: "financial", label: "financial", color: "#d97706" },
  { id: "secret", label: "secret", color: "#dc2626" },
]

function build(active: Set<string>) {
  const nodes = new Map<string, N>()
  const links = new Map<string, L>()
  const node = (id: string, name: string, color: string) => nodes.set(id, nodes.get(id) ?? { id, name, color })
  const link = (source: string, target: string, value: number, cls: string) => {
    const k = `${source}>${target}>${cls}`
    const l = links.get(k)
    if (l) l.value += value
    else links.set(k, { source, target, value, cls })
  }
  const tables = model.elements.filter((e) => e.kind === "tables")
  for (const c of CLASSES.filter((c) => active.has(c.id))) {
    for (const t of tables) {
      const n = ((t.raw.columns as { class: string }[]) ?? []).filter((x) => x.class === c.id).length
      if (!n) continue
      node("class." + c.id, c.label, c.color)
      node(t.id, t.name, KINDS.tables.color)
      link("class." + c.id, t.id, n, c.id)
      for (const r of model.elements.filter((e) => e.kind === "routes" && ((e.raw.reads as string[]) ?? []).includes(t.id))) {
        const mod = model.byId.get(String(r.raw.module))
        if (!mod) continue
        node(mod.id, mod.name, KINDS.modules.color)
        link(t.id, mod.id, n, c.id)
        for (const cl of ((r.raw.callers as string[]) ?? []).map((x) => model.byId.get(x)).filter(Boolean)) {
          node(cl!.id, cl!.name, KINDS[cl!.kind]?.color ?? "#888")
          link(mod.id, cl!.id, n, c.id)
        }
      }
      for (const p of model.elements.filter((e) => e.kind === "processing" && ((e.raw.tables as string[]) ?? []).includes(t.id))) {
        for (const ex of ((p.raw.subprocessors as string[]) ?? []).map((x) => model.byId.get(x)).filter(Boolean)) {
          node(ex!.id, `${ex!.name} (${ex!.raw.country})`, KINDS.externals.color)
          link(t.id, ex!.id, n, c.id)
        }
      }
    }
  }
  return { nodes: [...nodes.values()], links: [...links.values()] }
}

export function DataFlowView({ sel, onSelect }: P) {
  const [active, setActive] = useState(new Set(["personal", "financial"]))
  const W = 1100
  const H = 760
  const graph = useMemo(() => {
    const g = build(active)
    if (!g.links.length) return null
    const index = new Map(g.nodes.map((n, i) => [n.id, i]))
    const s = sankey<N, L & { source: number; target: number }>().nodeWidth(12).nodePadding(10).extent([[1, 8], [W - 220, H - 8]])
    return s({ nodes: g.nodes.map((n) => ({ ...n })), links: g.links.map((l) => ({ ...l, source: index.get(l.source)!, target: index.get(l.target)! })) } as any) as SankeyGraph<N, any>
  }, [active])
  const hot = (l: any) => sel && (l.source.id === sel || l.target.id === sel)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {CLASSES.map((c) => (
          <Button key={c.id} variant={active.has(c.id) ? "default" : "outline"} size="sm" className="h-7 gap-1.5 text-xs" onClick={() => {
            const n = new Set(active)
            if (n.has(c.id)) n.delete(c.id)
            else n.add(c.id)
            setActive(n)
          }}>
            <span className="size-2 rounded-full" style={{ background: c.color }} />{c.label}
          </Button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">Data class → table → module → client or external service. Width = number of columns.</span>
      </div>
      <div className="overflow-auto rounded-lg border bg-card p-4">
        {graph ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Personal data flow">
            <g fill="none">
              {graph.links.map((l: any, i) => (
                <path key={i} d={sankeyLinkHorizontal()(l) ?? ""} stroke={CLASSES.find((c) => c.id === l.cls)?.color} strokeOpacity={sel ? (hot(l) ? 0.7 : 0.06) : 0.28} strokeWidth={Math.max(1, l.width)} />
              ))}
            </g>
            {graph.nodes.map((n: any) => (
              <g key={n.id} onClick={() => !n.id.startsWith("class.") && onSelect(n.id)} className={cn(!n.id.startsWith("class.") && "cursor-pointer")}>
                <rect x={n.x0} y={n.y0} width={n.x1 - n.x0} height={Math.max(2, n.y1 - n.y0)} rx={2} fill={n.color} opacity={sel && sel !== n.id ? 0.6 : 1} />
                <text x={n.x1 + 6} y={(n.y0 + n.y1) / 2} dy="0.35em" fontSize={11} fill="currentColor" className={cn(sel === n.id && "font-semibold")}>{n.name}</text>
              </g>
            ))}
          </svg>
        ) : (
          <div className="text-sm text-muted-foreground">No data class selected.</div>
        )}
      </div>
    </div>
  )
}
