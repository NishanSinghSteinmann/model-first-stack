import { useEffect, useState } from "react"

export type Mode = "list" | "2d" | "3d"
export type Nav = { section: string; sel: string | null; mode: Mode | null; focus: boolean }

function read(): Nav {
  const [section = "overview", sel = "", mode = "", focus = ""] = decodeURIComponent(location.hash.slice(2)).split("/")
  return { section, sel: sel || null, mode: (mode as Mode) || null, focus: focus === "focus" }
}

function write(n: Nav) {
  location.hash = "/" + [n.section, n.sel ?? "", n.mode ?? "", n.focus ? "focus" : ""].map(encodeURIComponent).join("/").replace(/\/+$/, "")
}

export function useNav() {
  const [nav, setNav] = useState<Nav>(read)
  useEffect(() => {
    const on = () => setNav(read())
    addEventListener("hashchange", on)
    return () => removeEventListener("hashchange", on)
  }, [])
  const go = (patch: Partial<Nav>) => write({ ...nav, ...patch })
  return [nav, go] as const
}
