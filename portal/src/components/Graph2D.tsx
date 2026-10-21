import { useEffect, useMemo } from "react"
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, useNodesState, useEdgesState, ReactFlowProvider, useReactFlow, type Node, type NodeProps } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import dagre from "@dagrejs/dagre"
import { model } from "@/model"
import { FIELD_LABELS, KINDS } from "@/model/kinds"
import { cn } from "@/lib/utils"
import { FindingCount, StatusDot } from "./bits"
import type { G } from "./graph"

type Data = { id: string; dim: boolean; center: boolean; sel: boolean }

function Card({ data }: NodeProps<Node<Data>>) {
  const e = model.byId.get(data.id)!
  const k = KINDS[e.kind]
  const f = model.findings.filter((x) => x.element === e.id && x.severity !== "info")
  return (
    <div className={cn("w-[220px] rounded-lg border bg-card text-card-foreground shadow-xs transition-all", data.sel && "ring-2 ring-link", data.center && "border-link", data.dim && "opacity-45")}>
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-transparent" />
      <div className="h-1 rounded-t-lg" style={{ background: k?.color }} />
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <StatusDot status={e.status} />
          <span className="truncate text-[13px] font-medium">{e.name}</span>
          <span className="ml-auto"><FindingCount findings={f} /></span>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{k?.label}</div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-transparent" />
    </div>
  )
}

const nodeTypes = { card: Card }

function layout(g: G) {
  const d = new dagre.graphlib.Graph()
  d.setGraph({ rankdir: "LR", nodesep: 18, ranksep: 90 })
  d.setDefaultEdgeLabel(() => ({}))
  g.nodes.forEach((n) => d.setNode(n, { width: 220, height: 56 }))
  g.edges.forEach((e) => d.setEdge(e.from, e.to))
  dagre.layout(d)
  return g.nodes.map((n) => ({ id: n, x: d.node(n).x - 110, y: d.node(n).y - 28 }))
}

function Inner({ g, sel, onSelect, dimOthers }: { g: G; sel: string | null; onSelect: (id: string) => void; dimOthers?: Set<string> }) {
  const pos = useMemo(() => layout(g), [g])
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<Data>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([])
  const rf = useReactFlow()
  useEffect(() => {
    setNodes(pos.map((p) => ({ id: p.id, type: "card", position: { x: p.x, y: p.y }, data: { id: p.id, sel: p.id === sel, center: p.id === g.center, dim: !!dimOthers && !dimOthers.has(p.id) } })))
    setEdges(g.edges.map((e, i) => {
      const hot = sel && (e.from === sel || e.to === sel)
      return {
        id: `${e.from}-${e.to}-${i}`, source: e.from, target: e.to, type: "smoothstep",
        label: (!sel && g.edges.length < 60) || hot ? FIELD_LABELS[e.field] ?? e.field : undefined,
        labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" }, labelBgStyle: { fill: "var(--background)" },
        style: { stroke: hot ? "var(--link)" : "var(--muted-foreground)", strokeWidth: !sel ? 1.75 : hot ? 3 : 1, opacity: !sel ? 0.6 : hot ? 1 : 0.1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: hot ? "var(--link)" : "var(--ring)", width: !sel || hot ? 18 : 8, height: !sel || hot ? 18 : 8 },
        animated: !!hot,
      }
    }))
    const t = setTimeout(() => rf.fitView({ padding: 0.15, duration: 250 }), 30)
    return () => clearTimeout(t)
  }, [pos, sel])
  return (
    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes}
      onNodeClick={(_, n) => onSelect(n.id)} minZoom={0.1} proOptions={{ hideAttribution: true }} fitView>
      <Background gap={24} size={1} color="var(--border)" />
      <Controls showInteractive={false} className="!shadow-none [&>button]:!border-border [&>button]:!bg-card" />
    </ReactFlow>
  )
}

export function Graph2D(props: { g: G; sel: string | null; onSelect: (id: string) => void; dimOthers?: Set<string> }) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  )
}
