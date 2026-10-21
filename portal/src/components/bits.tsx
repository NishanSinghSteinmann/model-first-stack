import { KINDS } from "@/model/kinds"
import type { Finding, Severity, Status } from "@/model/core"
import { cn } from "@/lib/utils"

export function KindBadge({ kind, className }: { kind: string; className?: string }) {
  const k = KINDS[kind]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground", className)}>
      <span className="size-2 rounded-sm" style={{ background: k?.color }} />
      {k?.label ?? kind}
    </span>
  )
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  planned: { label: "planned", cls: "bg-planned" },
  later: { label: "later", cls: "bg-planned/50" },
  wip: { label: "in progress", cls: "bg-link" },
  built: { label: "built", cls: "bg-warn" },
  verified: { label: "verified", cls: "bg-ok" },
  drift: { label: "drift", cls: "bg-destructive" },
}

export function StatusDot({ status }: { status: Status }) {
  return <span title={STATUS[status]?.label} className={cn("inline-block size-2 shrink-0 rounded-full", STATUS[status]?.cls)} />
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium">
      <StatusDot status={status} />
      {STATUS[status]?.label}
    </span>
  )
}

export const SEV: Record<Severity, { label: string; cls: string; dot: string }> = {
  error: { label: "Error", cls: "text-destructive border-destructive/40 bg-destructive/5", dot: "bg-destructive" },
  warning: { label: "Warning", cls: "text-warn border-warn/50 bg-warn/10", dot: "bg-warn" },
  info: { label: "Info", cls: "text-muted-foreground", dot: "bg-planned" },
}

export function FindingCount({ findings }: { findings: Finding[] }) {
  if (!findings.length) return null
  const worst: Severity = findings.some((f) => f.severity === "error") ? "error" : findings.some((f) => f.severity === "warning") ? "warning" : "info"
  return (
    <span className={cn("inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-full border px-1.5 text-[11px] font-medium tabular-nums", SEV[worst].cls)}>
      {findings.length}
    </span>
  )
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]", className)}>{children}</code>
}

export function Method({ m }: { m: string }) {
  const c: Record<string, string> = { GET: "text-sky-600", POST: "text-emerald-600", PUT: "text-amber-600", PATCH: "text-amber-600", DELETE: "text-red-600" }
  return <span className={cn("inline-block w-14 font-mono text-[11px] font-semibold", c[m])}>{m}</span>
}
