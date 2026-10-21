import { useEffect, useMemo } from "react"
import { Box, List, Network, X } from "lucide-react"
import { model } from "@/model"
import { KINDS, SECTIONS, sectionOfKind } from "@/model/kinds"
import { useNav, type Mode } from "@/lib/nav"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Button } from "@/components/ui/button"
import { Sidebar } from "@/components/Sidebar"
import { Inspector } from "@/components/Inspector"
import { Graph2D } from "@/components/Graph2D"
import { Graph3D } from "@/components/Graph3D"
import { allGraph, focusGraph, sectionGraph } from "@/components/graph"
import { KanbanView, ReleasesView } from "@/components/PlanBoards"
import { Layers3D, LayersView } from "@/components/Layers"
import { RequestsView } from "@/components/Requests"
import { DataFlowView } from "@/components/DataFlow"
import { HistoryView } from "@/components/History"
import { FocusView, TimelineView } from "@/components/Roadmap"
import { LensContext, reachable } from "@/lib/lens"
import { useState } from "react"
import { Eye } from "lucide-react"
import { DatabaseView, FindingsView, FlowsView, GenericView, OverviewView, PlanView, RolesView, RoutesView } from "@/components/Views"

const SPECIAL: Record<string, React.ComponentType<{ sel: string | null; onSelect: (id: string) => void }>> = {
  routes: RoutesView,
  database: DatabaseView,
  roles: RolesView,
  flows: FlowsView,
  plan: PlanView,
  findings: FindingsView,
  kanban: KanbanView,
  releases: ReleasesView,
  shells: LayersView,
  requests: RequestsView,
  dataflow: DataFlowView,
  history: HistoryView,
  roadmap: FocusView,
  overviewplan: TimelineView,
}

export default function App() {
  const [nav, go] = useNav()
  const section = SECTIONS.find((s) => s.id === nav.section) ?? SECTIONS[0]
  const mode: Mode = ["requests", "roadmap", "overviewplan"].includes(section.id) ? "list" : nav.mode ?? (nav.focus ? "2d" : section.mode === "graph" ? "2d" : "list")
  const sel = nav.sel
  const [lensRole, setLensRole] = useState<string>("")
  const lens = useMemo(() => (lensRole ? reachable(lensRole) : null), [lensRole])
  useEffect(() => {
    const m = matchMedia("(prefers-color-scheme: dark)")
    const apply = () => document.documentElement.classList.toggle("dark", m.matches)
    apply()
    m.addEventListener("change", apply)
    return () => m.removeEventListener("change", apply)
  }, [])

  const graph = useMemo(() => {
    if (nav.focus && sel) return focusGraph(sel, 1)
    if (section.id === "overview" || section.id === "findings") return allGraph()
    return sectionGraph(section.kinds, true)
  }, [nav.focus, sel, section.id])
  const core = useMemo(() => new Set(model.elements.filter((e) => section.kinds.includes(e.kind)).map((e) => e.id)), [section.id])

  const select = (id: string) => go({ sel: id })
  const selected = sel ? model.byId.get(sel) : null
  const crumbs = [section.group, section.label, ...(selected ? [selected.name] : [])]
  const Special = SPECIAL[section.id]

  return (
    <LensContext.Provider value={lens}>
    <div className="flex h-full">
      <Sidebar
        section={section.id}
        onSection={(s) => go({ section: s, sel: null, mode: null, focus: false })}
        onSelect={(id) => go({ section: sectionOfKind(model.byId.get(id)?.kind ?? "")?.id ?? nav.section, sel: id, focus: false })}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-4 border-b px-6 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-link">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted-foreground">/</span>}
                  <button className="hover:underline" onClick={() => go({ sel: i < 2 ? null : sel, focus: false })}>{c}</button>
                </span>
              ))}
              {nav.focus && <span className="text-muted-foreground">· Neighborhood</span>}
            </div>
            <h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight">{nav.focus && selected ? `Neighborhood of ${selected.name}` : section.label}</h1>
          </div>
          {nav.focus && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => go({ focus: false, mode: null })}>
              <X className="size-3.5" /> Close neighborhood
            </Button>
          )}
          {!["roadmap", "overviewplan"].includes(section.id) && <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Eye className="size-3.5" />
            <select value={lensRole} onChange={(e) => setLensRole(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground">
              <option value="">All roles</option>
              {model.elements.filter((e) => e.kind === "roles").map((r) => <option key={r.id} value={r.id}>Lens: {r.name}</option>)}
            </select>
          </label>}
          {!["requests", "roadmap", "overviewplan"].includes(section.id) && <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && go({ mode: v as Mode })}>
            <ToggleGroupItem value="list" disabled={nav.focus} className="gap-1.5 px-3 text-xs"><List className="size-3.5" />List</ToggleGroupItem>
            <ToggleGroupItem value="2d" className="gap-1.5 px-3 text-xs"><Network className="size-3.5" />2D</ToggleGroupItem>
            <ToggleGroupItem value="3d" className="gap-1.5 px-3 text-xs"><Box className="size-3.5" />3D</ToggleGroupItem>
          </ToggleGroup>}
        </div>
        <div className="relative min-h-0 flex-1">
          {mode === "list" ? (
            <div className={section.id === "requests" ? "absolute inset-0" : section.id === "kanban" ? "absolute inset-0 p-6" : "absolute inset-0 overflow-auto p-6"}>
              {section.id === "overview" ? (
                <OverviewView sel={sel} onSelect={select} onSection={(s) => go({ section: s, sel: null, mode: null })} />
              ) : Special ? (
                <Special sel={sel} onSelect={select} />
              ) : (
                <GenericView kinds={section.kinds} sel={sel} onSelect={select} />
              )}
            </div>
          ) : mode === "2d" ? (
            <Graph2D g={graph} sel={sel} onSelect={select} dimOthers={lens ?? (nav.focus || !section.kinds.length ? undefined : core)} />
          ) : section.id === "shells" && !nav.focus ? (
            <Layers3D sel={sel} onSelect={select} />
          ) : (
            <Graph3D g={graph} sel={sel} onSelect={select} />
          )}
          {mode !== "list" && !(section.id === "shells" && mode === "3d" && !nav.focus) && (
            <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[60%] flex-wrap gap-x-3 gap-y-1 rounded-md border bg-background/90 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
              {[...new Set(graph.nodes.map((n) => model.byId.get(n)!.kind))].map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-sm" style={{ background: KINDS[k]?.color }} />
                  {KINDS[k]?.plural}
                </span>
              ))}
            </div>
          )}
        </div>
      </main>
      {sel && section.id !== "roadmap" && <Inspector id={sel} onSelect={select} onClose={() => go({ sel: null, focus: false, mode: nav.focus ? null : nav.mode })} onFocus={() => go({ focus: true, mode: mode === "3d" ? "3d" : "2d" })} />}
    </div>
    </LensContext.Provider>
  )
}
