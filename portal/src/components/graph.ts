import { model } from "@/model"

export type G = { nodes: string[]; edges: { from: string; to: string; field: string }[]; center: string | null }

export function sectionGraph(kinds: string[], withNeighbors: boolean): G {
  const core = model.elements.filter((e) => kinds.includes(e.kind)).map((e) => e.id)
  const set = new Set(core)
  if (withNeighbors) for (const id of core) for (const x of [...(model.out.get(id) ?? []), ...(model.inc.get(id) ?? [])]) set.add(x.from === id ? x.to : x.from)
  return finish(set, null)
}

export function focusGraph(id: string, depth = 1): G {
  const set = new Set([id])
  let frontier = [id]
  for (let d = 0; d < depth; d++) {
    const next: string[] = []
    for (const n of frontier)
      for (const x of [...(model.out.get(n) ?? []), ...(model.inc.get(n) ?? [])]) {
        const o = x.from === n ? x.to : x.from
        if (!set.has(o)) { set.add(o); next.push(o) }
      }
    frontier = next
  }
  return finish(set, id)
}

export function allGraph(): G {
  return finish(new Set(model.elements.map((e) => e.id)), null)
}

function finish(set: Set<string>, center: string | null): G {
  const edges = model.edges.filter((e) => set.has(e.from) && set.has(e.to))
  return { nodes: [...set], edges, center }
}
