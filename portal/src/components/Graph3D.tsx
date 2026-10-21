import { useEffect, useMemo, useRef, useState } from "react"
import ForceGraph3D from "react-force-graph-3d"
import * as THREE from "three"
import { model } from "@/model"
import { KINDS } from "@/model/kinds"
import type { G } from "./graph"
import { useLens } from "@/lib/lens"

function label(text: string, color: string) {
  const c = document.createElement("canvas")
  const ctx = c.getContext("2d")!
  ctx.font = "500 40px -apple-system, Inter, sans-serif"
  const w = Math.min(ctx.measureText(text).width + 24, 1000)
  c.width = w
  c.height = 56
  ctx.font = "500 40px -apple-system, Inter, sans-serif"
  ctx.fillStyle = color
  ctx.fillText(text, 12, 40)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  s.scale.set(w / 10, 5.6, 1)
  s.position.set(0, 9, 0)
  return s
}

export function Graph3D({ g, sel, onSelect }: { g: G; sel: string | null; onSelect: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const fg = useRef<any>(null)
  const lens = useLens()
  const [size, setSize] = useState({ w: 800, h: 600 })
  const dark = matchMedia("(prefers-color-scheme: dark)").matches
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  const data = useMemo(() => {
    const layers = [...new Set(g.nodes.map((n) => KINDS[model.byId.get(n)!.kind]?.layer ?? 0))].sort((a, b) => a - b)
    return {
      nodes: g.nodes.map((id) => {
        const e = model.byId.get(id)!
        const layer = layers.indexOf(KINDS[e.kind]?.layer ?? 0)
        return { id, name: e.name, kind: e.kind, fy: (layers.length / 2 - layer) * 45, bad: model.findings.some((f) => f.element === id && f.severity === "error") }
      }),
      links: g.edges.map((e) => ({ source: e.from, target: e.to })),
    }
  }, [g])
  useEffect(() => {
    const t = setTimeout(() => fg.current?.zoomToFit(600, 40), 900)
    return () => clearTimeout(t)
  }, [data])
  const textColor = dark ? "#e5e5e5" : "#262626"
  return (
    <div ref={box} className="absolute inset-0">
      <ForceGraph3D
        ref={fg}
        width={size.w}
        height={size.h}
        graphData={data}
        backgroundColor={dark ? "#0a0a0a" : "#fafafa"}
        showNavInfo={false}
        nodeRelSize={4}
        nodeVal={(n: any) => (n.id === sel || n.id === g.center ? 4 : 1.4)}
        nodeColor={(n: any) => (lens && !lens.has(n.id) ? (dark ? "#27272a" : "#e4e4e7") : n.bad ? "#dc2626" : KINDS[n.kind]?.color ?? "#888")}
        nodeOpacity={0.95}
        nodeThreeObjectExtend
        nodeThreeObject={(n: any) => (g.nodes.length <= 80 || n.id === sel ? label(n.name, textColor) : undefined) as any}
        nodeLabel={(n: any) => `${n.name} · ${KINDS[n.kind]?.label}`}
        linkColor={(l: any) => (!sel ? "rgba(113,113,122,0.9)" : hot(l, sel) ? "#3b82f6" : "rgba(113,113,122,0.12)")}
        linkOpacity={1}
        linkWidth={(l: any) => (!sel ? 0.9 : hot(l, sel) ? 2.5 : 0.2)}
        linkDirectionalArrowLength={(l: any) => (!sel ? 4 : hot(l, sel) ? 6 : 0)}
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={(l: any) => ((l.source.id ?? l.source) === sel ? 2 : 0)}
        linkDirectionalParticleWidth={3}
        onNodeClick={(n: any) => onSelect(n.id)}
      />
    </div>
  )
}

function hot(l: any, sel: string) {
  return (l.source.id ?? l.source) === sel || (l.target.id ?? l.target) === sel
}
