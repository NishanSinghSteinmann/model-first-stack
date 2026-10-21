import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type H = { sha: string; date: string; subject: string; elements: number; edges: number; status: Record<string, number>; findings: Record<string, number> }

const STATUS = [
  { k: "verified", label: "verified", cls: "bg-ok" },
  { k: "built", label: "built", cls: "bg-warn" },
  { k: "wip", label: "in progress", cls: "bg-link" },
  { k: "planned", label: "planned", cls: "bg-planned" },
  { k: "drift", label: "drift", cls: "bg-destructive" },
]

export function HistoryView() {
  const [data, setData] = useState<H[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch("/api/history").then((r) => (r.ok ? r.json() : r.text().then((t) => Promise.reject(new Error(t))))).then(setData).catch((e) => setErr(e.message))
  }, [])
  if (err) return <div className="text-sm text-destructive">{err}</div>
  if (!data) return <div className="text-sm text-muted-foreground">Loading history from git…</div>
  const maxEl = Math.max(...data.map((d) => d.elements), 1)
  const maxF = Math.max(...data.map((d) => d.findings.error + d.findings.warning), 1)
  return (
    <div className="space-y-5">
      <Card className="gap-2 py-4">
        <CardHeader className="px-4"><CardTitle className="text-sm">Model per commit</CardTitle></CardHeader>
        <CardContent className="px-4">
          <div className="flex h-56 items-end gap-2">
            {data.map((d) => (
              <div key={d.sha} className="flex h-full min-w-6 flex-1 flex-col items-center justify-end gap-1" title={`${d.sha} · ${d.subject}`}>
                <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(d.elements / maxEl) * 100}%` }}>
                  {STATUS.map((s) => <div key={s.k} className={s.cls} style={{ flexGrow: d.status[s.k] ?? 0 }} />)}
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">{d.elements}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {STATUS.map((s) => <span key={s.k} className="flex items-center gap-1.5"><span className={cn("size-2 rounded-sm", s.cls)} />{s.label}</span>)}
          </div>
        </CardContent>
      </Card>
      <Card className="gap-2 py-4">
        <CardHeader className="px-4"><CardTitle className="text-sm">Errors and warnings per commit, measured with today's rules</CardTitle></CardHeader>
        <CardContent className="px-4">
          <div className="flex h-32 items-end gap-2">
            {data.map((d) => (
              <div key={d.sha} className="flex h-full min-w-6 flex-1 flex-col-reverse items-stretch" title={`${d.findings.error} errors, ${d.findings.warning} warnings`}>
                <div className="bg-destructive" style={{ height: `${(d.findings.error / maxF) * 100}%` }} />
                <div className="rounded-t bg-warn" style={{ height: `${(d.findings.warning / maxF) * 100}%` }} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40"><tr>{["Commit", "Date", "Message", "Elements", "Connections", "Errors", "Warnings"].map((h) => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.sha} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{d.sha}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{d.date}</td>
                <td className="px-3 py-2">{d.subject}</td>
                <td className="px-3 py-2 tabular-nums">{d.elements}</td>
                <td className="px-3 py-2 tabular-nums">{d.edges}</td>
                <td className="px-3 py-2 tabular-nums text-destructive">{d.findings.error}</td>
                <td className="px-3 py-2 tabular-nums text-warn">{d.findings.warning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
