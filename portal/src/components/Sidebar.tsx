import { useMemo, useState } from "react"
import { ChevronRight, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { model } from "@/model"
import { NAV } from "@/model/kinds"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { FindingCount, KindBadge } from "./bits"

export function Sidebar({ section, onSection, onSelect }: { section: string; onSection: (s: string) => void; onSelect: (id: string) => void }) {
  const [q, setQ] = useState("")
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("sidebar") === "closed" } catch { return false } })
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("groups") ?? "") } catch { return { Overview: true, Plan: true } }
  })
  const flip = (g: string) => { const n = { ...open, [g]: !open[g] }; setOpen(n); try { localStorage.setItem("groups", JSON.stringify(n)) } catch {} }
  const toggle = (v: boolean) => { setCollapsed(v); try { localStorage.setItem("sidebar", v ? "closed" : "open") } catch {} }
  const hits = useMemo(() => {
    if (q.trim().length < 2) return []
    const s = q.toLowerCase()
    return model.elements.filter((e) => e.name.toLowerCase().includes(s) || e.id.toLowerCase().includes(s)).slice(0, 30)
  }, [q])
  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center border-r bg-sidebar pt-3">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => toggle(false)} title="Open sidebar">
          <PanelLeftOpen className="size-4" />
        </Button>
      </aside>
    )
  }
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold tracking-tight">Model-first Stack</div>
            <div className="text-xs text-muted-foreground">Target architecture</div>
          </div>
          <Button variant="ghost" size="icon" className="-mr-2 size-8" onClick={() => toggle(true)} title="Collapse sidebar">
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-8 pl-8 text-xs" />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-4">
          {hits.length > 0 ? (
            <div className="space-y-0.5">
              {hits.map((e) => (
                <button key={e.id} onClick={() => { onSelect(e.id); setQ("") }} className="flex w-full flex-col items-start gap-1 rounded-md px-2 py-1.5 text-left hover:bg-accent">
                  <span className="text-sm">{e.name}</span>
                  <KindBadge kind={e.kind} />
                </button>
              ))}
            </div>
          ) : (
            NAV.map((g) => (
              <div key={g.label} className="mb-1">
                <button onClick={() => flip(g.label)} className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  <ChevronRight className={cn("size-3 transition-transform", (open[g.label] || g.sections.some((x) => x.id === section)) && "rotate-90")} />
                  {g.label}
                </button>
                {(open[g.label] || g.sections.some((x) => x.id === section)) && g.sections.map((s) => {
                  const els = model.elements.filter((e) => s.kinds.includes(e.kind))
                  const ids = new Set(els.map((e) => e.id))
                  const f = s.id === "findings" ? model.findings.filter((x) => x.severity !== "info") : model.findings.filter((x) => ids.has(x.element) && x.severity !== "info")
                  return (
                    <button
                      key={s.id}
                      onClick={() => onSection(s.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                        section === s.id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <span className="flex-1 text-left">{s.label}</span>
                      {s.kinds.length > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{els.length}</span>}
                      <FindingCount findings={f} />
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}
