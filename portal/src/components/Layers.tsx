import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown } from "lucide-react"
import ForceGraph3D from "react-force-graph-3d"
import * as THREE from "three"
import { model } from "@/model"
import { KINDS } from "@/model/kinds"
import type { Element } from "@/model/core"
import { cn } from "@/lib/utils"
import { FindingCount } from "./bits"
import { useLens } from "@/lib/lens"

type P = { sel: string | null; onSelect: (id: string) => void }

export type Band = { id: string; label: string; sub?: string; color: string; groups: { label: string; items: Element[] }[]; side?: Band }

const of = (kind: string) => model.elements.filter((e) => e.kind === kind)
const inShell = (kind: string, shell: string) => of(kind).filter((e) => e.raw.shell === shell)

export function bands(): Band[] {
  const mk = (id: string, extra: { label: string; items: Element[] }[] = []): Band | null => {
    const s = model.byId.get(id)
    if (!s) return null
    return {
      id,
      label: s.name,
      sub: String(s.raw.package ?? ""),
      color: KINDS.shells.color,
      groups: [
        { label: "Controls", items: inShell("controls", id) },
        { label: "Abstractions", items: inShell("abstractions", id) },
        ...extra,
      ].filter((g) => g.items.length),
    }
  }
  const clients = of("apps").filter((a) => ["client", "web"].includes(String(a.raw.kind)))
  const side = mk("shell.egress", [{ label: "External services", items: of("externals") }])
  const data = mk("shell.data", [{ label: "Tables", items: of("tables") }])
  const rest: (Band | null)[] = [
    { id: "actors", label: "Actors", sub: "People and machines", color: KINDS.actors.color, groups: [{ label: "Actors", items: of("actors") }] },
    { id: "devices", label: "Devices", sub: "what the clients run on", color: KINDS.devices.color, groups: [{ label: "Devices", items: of("devices") }] },
    { id: "clients", label: "Clients", sub: "Apps that talk to the API", color: KINDS.apps.color, groups: [{ label: "Clients", items: clients }] },
    mk("shell.edge", [{ label: "Containers", items: of("apps").filter((a) => a.raw.shell === "shell.edge") }]),
    mk("shell.request"),
    mk("shell.access", [{ label: "Roles", items: of("roles") }, { label: "Routes", items: of("routes") }]),
    mk("shell.domain", [{ label: "Modules", items: inShell("modules", "shell.domain") }, { label: "Jobs", items: of("jobs") }]),
    data ? (side ? { ...data, side } : data) : null,
    { id: "store", label: "Storage", color: KINDS.resources.color, groups: [{ label: "Resources", items: of("resources") }] },
  ]
  return rest.filter((b): b is Band => !!b).filter((b) => b.groups.length > 0 || b.id.startsWith("shell."))
}

function Chip({ e, sel, onSelect, dense }: { e: Element; dense?: boolean } & P) {
  const f = model.findings.filter((x) => x.element === e.id && x.severity !== "info")
  const lens = useLens()
  return (
    <button
      onClick={() => onSelect(e.id)}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background text-left transition-colors hover:border-link",
        dense ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        sel === e.id && "border-link bg-link/5 text-link",
        lens && !lens.has(e.id) && "opacity-25",
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: KINDS[e.kind]?.color }} />
      <span className="truncate">{e.kind === "routes" ? `${e.raw.method} ${e.raw.path}` : e.name}</span>
      {f.length > 0 && <FindingCount findings={f} />}
    </button>
  )
}

export function heat(b: Band) {
  const ids = new Set([b.id, ...b.groups.flatMap((g) => g.items.map((i) => i.id))])
  const f = model.findings.filter((x) => ids.has(x.element) && x.severity !== "info")
  return { errors: f.filter((x) => x.severity === "error").length, warnings: f.filter((x) => x.severity === "warning").length }
}

function BandBox({ b, sel, onSelect }: { b: Band } & P) {
  const isShell = b.id.startsWith("shell.")
  const s = model.byId.get(b.id)
  const h = heat(b)
  return (
    <div className={cn("flex-1 rounded-xl border bg-card", h.errors ? "border-destructive/60 bg-destructive/[0.03]" : h.warnings ? "border-warn/60 bg-warn/[0.04]" : "", sel === b.id && "ring-2 ring-link")}>
      <div className="flex">
        <button onClick={() => isShell && onSelect(b.id)} className="w-52 shrink-0 border-r p-4 text-left">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 rounded-full" style={{ background: b.color }} />
            <span className="font-semibold">{b.label}</span>
          </div>
          {b.sub && <div className="mt-1 font-mono text-[10px] text-muted-foreground">{b.sub}</div>}
          {(h.errors > 0 || h.warnings > 0) && (
            <div className="mt-2 flex gap-1.5 text-[11px]">
              {h.errors > 0 && <span className="rounded border border-destructive/50 px-1.5 text-destructive">{h.errors} errors</span>}
              {h.warnings > 0 && <span className="rounded border border-warn/60 px-1.5 text-warn">{h.warnings} warnings</span>}
            </div>
          )}
          {s?.raw.description ? <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{String(s.raw.description)}</div> : null}
        </button>
        <div className="min-w-0 flex-1 space-y-2.5 p-3">
          {b.groups.map((g) => (
            <div key={g.label}>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{g.label} · {g.items.length}</div>
              <div className={cn("flex flex-wrap gap-1", g.items.length > 14 && "max-h-28 overflow-auto")}>
                {g.items.map((e) => <Chip key={e.id} e={e} sel={sel} onSelect={onSelect} dense={g.items.length > 14} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LayersView({ sel, onSelect }: P) {
  const bs = useMemo(bands, [])
  return (
    <div className="mx-auto max-w-6xl">
      <p className="mb-4 text-sm text-muted-foreground">Every request passes from top to bottom through all shells. A shell may only use the one directly below it; the business logic branches into data or outbound.</p>
      {bs.map((b, i) => (
        <div key={b.id}>
          {i > 0 && (
            <div className="flex justify-center py-1.5 text-muted-foreground">
              <ArrowDown className="size-4" />
            </div>
          )}
          <div className="flex gap-3">
            <BandBox b={b} sel={sel} onSelect={onSelect} />
            {b.side && <BandBox b={b.side} sel={sel} onSelect={onSelect} />}
          </div>
        </div>
      ))}
    </div>
  )
}

function textSprite(text: string, color: string, size = 40, weight = 600) {
  const c = document.createElement("canvas")
  const ctx = c.getContext("2d")!
  const font = `${weight} ${size}px -apple-system, Inter, sans-serif`
  ctx.font = font
  const w = Math.ceil(ctx.measureText(text).width) + 16
  c.width = w
  c.height = size + 20
  ctx.font = font
  ctx.fillStyle = color
  ctx.fillText(text, 8, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  s.scale.set(w / 3.5, (size + 20) / 3.5, 1)
  return s
}

export type TraceStep = { ids: string[] }

export function Layers3D({ sel, onSelect, trace, active = -1 }: P & { trace?: TraceStep[]; active?: number }) {
  const lens = useLens()
  const box = useRef<HTMLDivElement>(null)
  const fg = useRef<any>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const dark = matchMedia("(prefers-color-scheme: dark)").matches
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  const { data, planes } = useMemo(() => {
    const bs = bands()
    const flat: { b: Band; x: number }[] = []
    bs.forEach((b) => {
      if (b.side) { flat.push({ b, x: -160 }); flat.push({ b: b.side, x: 160 }) } else flat.push({ b, x: 0 })
    })
    const levels = bs.length
    const nodes: any[] = []
    const planes: { y: number; x: number; w: number; label: string; color: string }[] = []
    const yOf = (b: Band) => (levels / 2 - bs.findIndex((x) => x === b || x.side === b)) * 70
    for (const { b, x } of flat) {
      const items = b.groups.flatMap((g) => g.items)
      const w = b.side || flat.some((f) => f.b.side === b) ? 240 : 520
      const cols = Math.max(1, Math.ceil(Math.sqrt(items.length * (w / 260))))
      const y = yOf(b)
      const h = heat(b)
      planes.push({ y, x, w, label: b.label, color: h.errors ? "#dc2626" : h.warnings ? "#d97706" : b.id.startsWith("shell.") ? "#8b5cf6" : b.color })
      items.forEach((e, i) => {
        const cx = (i % cols) - (cols - 1) / 2
        const cz = Math.floor(i / cols) - (Math.ceil(items.length / cols) - 1) / 2
        nodes.push({ id: e.id, name: e.name, kind: e.kind, fx: x + cx * (w / (cols + 1)), fy: y, fz: cz * (w * 0.55 / (Math.ceil(items.length / cols) + 1)) })
      })
    }
    const ids = new Set(nodes.map((n) => n.id))
    const links: any[] = model.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to && ["module", "shell", "reads", "uses", "writes", "permission", "calls", "runs"].includes(e.field)).map((e) => ({ source: e.from, target: e.to }))
    if (trace) {
      const steps = trace.map((t) => t.ids.filter((i) => ids.has(i)))
      steps.forEach((cur, i) => {
        const next = steps.slice(i + 1).find((x) => x.length)
        if (!next) return
        for (const a of cur.slice(0, 4)) for (const b of next.slice(0, 4)) links.push({ source: a, target: b, trace: i })
      })
    }
    return { data: { nodes, links }, planes }
  }, [trace])
  const stepOf = useMemo(() => {
    const m = new Map<string, number>()
    trace?.forEach((t, i) => t.ids.forEach((id) => { if (!m.has(id)) m.set(id, i) }))
    return m
  }, [trace])
  const lit = (id: string) => trace && (stepOf.get(id) ?? Infinity) <= active
  const dimmed = (id: string) => (lens && !lens.has(id)) || (trace && !lit(id))
  useEffect(() => {
    const g = fg.current
    if (!g) return
    const scene: THREE.Scene = g.scene()
    const added: THREE.Object3D[] = []
    for (const p of planes) {
      const geo = new THREE.BoxGeometry(p.w + 40, 2, p.w * 0.6 + 30)
      const mat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: dark ? 0.12 : 0.1, depthWrite: false })
      const m = new THREE.Mesh(geo, mat)
      m.position.set(p.x, p.y - 6, 0)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.5 }))
      edges.position.copy(m.position)
      const label = textSprite(p.label, dark ? "#e5e5e5" : "#262626")
      label.position.set(p.x - (p.w + 40) / 2 + label.scale.x / 2, p.y + 8, (p.w * 0.6 + 30) / 2)
      scene.add(m, edges, label)
      added.push(m, edges, label)
    }
    const t = setTimeout(() => g.cameraPosition({ x: 420, y: 260, z: 620 }, { x: 0, y: 0, z: 0 }, 800), 50)
    return () => { clearTimeout(t); added.forEach((o) => scene.remove(o)) }
  }, [planes, dark])
  return (
    <div ref={box} className="absolute inset-0">
      <ForceGraph3D
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor={dark ? "#0a0a0a" : "#fafafa"}
        showNavInfo={false}
        cooldownTicks={0}
        nodeRelSize={3}
        nodeVal={(n: any) => (n.id === sel || (trace && stepOf.get(n.id) === active) ? 6 : lit(n.id) ? 3 : 1.5)}
        nodeColor={(n: any) => (dimmed(n.id) ? (dark ? "#27272a" : "#e4e4e7") : trace && lit(n.id) ? "#3b82f6" : model.findings.some((f) => f.element === n.id && f.severity === "error") ? "#dc2626" : KINDS[n.kind]?.color ?? "#888")}
        nodeLabel={(n: any) => `${n.name} · ${KINDS[n.kind]?.label}`}
        linkColor={(l: any) => (l.trace !== undefined ? (l.trace < active ? "#3b82f6" : "rgba(59,130,246,0.15)") : trace || lens ? "rgba(113,113,122,0.08)" : !sel ? "rgba(113,113,122,0.9)" : hot(l, sel) ? "#3b82f6" : "rgba(113,113,122,0.12)")}
        linkWidth={(l: any) => (l.trace !== undefined ? (l.trace < active ? 3 : 0.6) : trace || lens ? 0.15 : !sel ? 0.9 : hot(l, sel) ? 2.5 : 0.2)}
        linkOpacity={1}
        linkDirectionalArrowLength={(l: any) => (l.trace !== undefined ? (l.trace < active ? 7 : 0) : trace || lens ? 0 : !sel ? 4 : hot(l, sel) ? 6 : 0)}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={(l: any) => (l.trace !== undefined ? (l.trace === active - 1 ? 4 : 0) : !trace && sel && hot(l, sel) ? 3 : 0)}
        linkDirectionalParticleWidth={3}
        onNodeClick={(n: any) => onSelect(n.id)}
      />
    </div>
  )
}

function hot(l: any, sel: string) {
  return (l.source.id ?? l.source) === sel || (l.target.id ?? l.target) === sel
}
