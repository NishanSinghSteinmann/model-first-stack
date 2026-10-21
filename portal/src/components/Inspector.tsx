import { Network, X } from "lucide-react"
import { model } from "@/model"
import { FIELD_LABELS, KINDS } from "@/model/kinds"
import { rolesForPermission, type Edge } from "@/model/core"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { KindBadge, Mono, SEV, StatusBadge } from "./bits"
import { cn } from "@/lib/utils"

function Link({ id, onSelect }: { id: string; onSelect: (id: string) => void }) {
  const e = model.byId.get(id)
  if (!e) return <Mono>{id}</Mono>
  return (
    <button onClick={() => onSelect(id)} className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-accent">
      <span className="size-2 shrink-0 rounded-sm" style={{ background: KINDS[e.kind]?.color }} />
      <span className="flex-1 truncate">{e.name}</span>
      <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100">{KINDS[e.kind]?.label}</span>
    </button>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <div className="mb-1.5 mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{children}</div>
}

export function Inspector({ id, onSelect, onFocus, onClose }: { id: string | null; onSelect: (id: string) => void; onFocus: () => void; onClose: () => void }) {
  if (!id || !model.byId.get(id)) {
    return (
      <aside className="flex h-full w-[22rem] shrink-0 flex-col border-l bg-sidebar p-5">
        <div className="text-sm font-medium">Nothing selected</div>
        <p className="mt-2 text-sm text-muted-foreground">Select an element to see what it references, what it is responsible for, and what the model check finds.</p>
        <Heading>Legend</Heading>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(KINDS).slice(0, 18).map(([k]) => <KindBadge key={k} kind={k} />)}
        </div>
      </aside>
    )
  }
  const e = model.byId.get(id)!
  const out = model.out.get(id) ?? []
  const inc = model.inc.get(id) ?? []
  const findings = model.findings.filter((f) => f.element === id)
  const byField = groupBy(out, (x) => x.field)
  const byKind = groupBy(inc, (x) => model.byId.get(x.from)?.kind ?? "?")
  const scalars = Object.entries(e.raw).filter(([k, v]) => !["id", "name", "description", "status", "columns", "steps"].includes(k) && !out.some((o) => o.field === k) && (typeof v !== "object" || (Array.isArray(v) && v.every((x) => typeof x !== "object"))))
  const columns = e.raw.columns as { name: string; type: string; class: string }[] | undefined
  return (
    <aside className="flex h-full w-[22rem] shrink-0 flex-col border-l bg-sidebar">
      <div className="p-5 pb-4">
        <div className="flex items-center gap-2">
          <KindBadge kind={e.kind} />
          <StatusBadge status={e.status} />
          <Button variant="ghost" size="icon" className="-mr-2 ml-auto size-7" onClick={onClose} title="Close">
            <X className="size-4" />
          </Button>
        </div>
        <div className="mt-2.5 text-lg font-semibold leading-tight tracking-tight">{e.name}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Mono>{e.id}</Mono>
          <span>architecture/{e.file}</span>
        </div>
        {e.raw.description ? <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{String(e.raw.description)}</p> : null}
        <Button variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={onFocus}>
          <Network className="size-3.5" /> Neighborhood as graph
        </Button>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-5 pb-6">
          {findings.length > 0 && (
            <>
              <Heading>Findings</Heading>
              <div className="space-y-1.5">
                {findings.map((f) => (
                  <div key={f.id} className={cn("rounded-md border px-2.5 py-2 text-xs", SEV[f.severity].cls)}>
                    <div className="font-medium">{f.rule}</div>
                    <div className="mt-0.5 opacity-90">{f.message}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {scalars.length > 0 && (
            <>
              <Heading>Properties</Heading>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {scalars.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{FIELD_LABELS[k] ?? k}</dt>
                    <dd className="break-words">{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {e.raw.stride ? (
            <>
              <Heading>Threat model (STRIDE)</Heading>
              <dl className="space-y-1.5 text-sm">
                {Object.entries(e.raw.stride as Record<string, string>).map(([k, v]) => (
                  <div key={k}><dt className="text-[11px] text-muted-foreground">{k.replace(/_/g, " ")}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </>
          ) : null}
          {e.kind === "permissions" && (
            <>
              <Heading>Roles with this permission</Heading>
              {rolesForPermission(model, id).map((r) => <Link key={r.id} id={r.id} onSelect={onSelect} />)}
            </>
          )}
          {e.kind === "routes" && e.raw.permission ? (
            <>
              <Heading>Who may call this route</Heading>
              {rolesForPermission(model, String(e.raw.permission)).map((r) => <Link key={r.id} id={r.id} onSelect={onSelect} />)}
            </>
          ) : null}
          {columns && (
            <>
              <Heading>Columns</Heading>
              <div className="overflow-hidden rounded-md border">
                {columns.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 border-b px-2.5 py-1.5 text-xs last:border-0">
                    <span className="flex-1 font-mono">{c.name}</span>
                    <span className="text-muted-foreground">{c.type}</span>
                    <ClassChip c={c.class} />
                  </div>
                ))}
              </div>
            </>
          )}
          {Object.entries(byField).map(([field, edges]) => (
            <div key={field}>
              <Heading>{FIELD_LABELS[field] ?? field}</Heading>
              {edges.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x) => <Link key={x.to + x.order} id={x.to} onSelect={onSelect} />)}
            </div>
          ))}
          {inc.length > 0 && (
            <>
              <Separator className="mt-5" />
              <div className="mt-4 text-sm font-semibold">Responsible for and used by</div>
              <p className="text-xs text-muted-foreground">Everything that references this element.</p>
              {Object.entries(byKind).map(([kind, edges]) => (
                <div key={kind}>
                  <Heading>{KINDS[kind]?.plural ?? kind} · {edges.length}</Heading>
                  {dedupe(edges.map((x) => x.from)).map((f) => <Link key={f} id={f} onSelect={onSelect} />)}
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}

export function ClassChip({ c }: { c: string }) {
  const cls: Record<string, string> = {
    secret: "border-destructive/50 text-destructive",
    financial: "border-amber-500/50 text-amber-600",
    personal: "border-violet-500/50 text-violet-600",
    business: "text-foreground",
  }
  const label = model.byId.get("class." + c)?.name ?? c
  return <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", cls[c] ?? "text-muted-foreground")}>{label}</span>
}

function groupBy<T>(xs: T[], k: (x: T) => string) {
  const r: Record<string, T[]> = {}
  for (const x of xs) (r[k(x)] ??= []).push(x)
  return r
}

function dedupe(xs: string[]) {
  return [...new Set(xs)]
}

export type { Edge }
