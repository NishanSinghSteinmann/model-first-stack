import { createContext, useContext } from "react"
import { model } from "@/model"

export function reachable(roleId: string): Set<string> {
  const role = model.byId.get(roleId)
  if (!role) return new Set()
  const perms = new Set((role.raw.grants as string[]) ?? [])
  const set = new Set<string>([roleId, ...perms])
  const routes = model.elements.filter((e) => e.kind === "routes" && (e.raw.public || perms.has(String(e.raw.permission))))
  for (const r of routes) {
    set.add(r.id)
    if (r.raw.module) set.add(String(r.raw.module))
    for (const t of (r.raw.reads as string[]) ?? []) set.add(t)
    for (const c of (r.raw.callers as string[]) ?? []) set.add(c)
    for (const j of model.elements.filter((x) => x.kind === "jobs" && x.raw.trigger === r.id)) {
      set.add(j.id)
      for (const u of (j.raw.uses as string[]) ?? []) set.add(u)
    }
  }
  for (const s of model.elements.filter((e) => e.kind === "screens" && ((e.raw.routes as string[]) ?? []).some((x) => set.has(x)))) set.add(s.id)
  for (const sh of model.elements.filter((e) => e.kind === "shells")) set.add(sh.id)
  return set
}

export const LensContext = createContext<Set<string> | null>(null)
export const useLens = () => useContext(LensContext)
