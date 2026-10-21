export type KindMeta = { label: string; plural: string; color: string; layer: number }

export const KINDS: Record<string, KindMeta> = {
  devices: { label: "Device", plural: "Devices", color: "#78716c", layer: 0 },
  actors: { label: "Actor", plural: "Actors", color: "#64748b", layer: 0 },
  boundaries: { label: "Trust boundary", plural: "Trust boundaries", color: "#94a3b8", layer: 0 },
  apps: { label: "App", plural: "Apps and containers", color: "#0ea5e9", layer: 1 },
  shells: { label: "Shell", plural: "Shells", color: "#8b5cf6", layer: 2 },
  modules: { label: "Module", plural: "Modules", color: "#16a34a", layer: 3 },
  abstractions: { label: "Abstraction", plural: "Abstractions", color: "#22c55e", layer: 3 },
  routes: { label: "Route", plural: "Routes", color: "#2563eb", layer: 2 },
  jobs: { label: "Job", plural: "Jobs", color: "#0891b2", layer: 4 },
  externals: { label: "External service", plural: "External services", color: "#db2777", layer: 6 },
  tables: { label: "Table", plural: "Tables", color: "#d97706", layer: 5 },
  classes: { label: "Data class", plural: "Data classes", color: "#f59e0b", layer: 6 },
  principal_types: { label: "Principal type", plural: "Principal types", color: "#7c3aed", layer: 1 },
  roles: { label: "Role", plural: "Roles", color: "#9333ea", layer: 1 },
  permissions: { label: "Permission", plural: "Permissions", color: "#a855f7", layer: 2 },
  resources: { label: "Cloud resource", plural: "Cloud resources", color: "#475569", layer: 7 },
  environments: { label: "Environment", plural: "Environments", color: "#334155", layer: 7 },
  domains: { label: "Domain", plural: "Domains", color: "#0284c7", layer: 0 },
  secrets: { label: "Secret", plural: "Secrets", color: "#be123c", layer: 7 },
  paths: { label: "Deployment path", plural: "Deployment paths", color: "#0f766e", layer: 8 },
  deploysteps: { label: "Deployment step", plural: "Deployment steps", color: "#14b8a6", layer: 8 },
  controls: { label: "Control", plural: "Controls", color: "#dc2626", layer: 2 },
  checks: { label: "Check", plural: "Checks", color: "#ef4444", layer: 8 },
  threats: { label: "Threat", plural: "Threats", color: "#b91c1c", layer: 2 },
  flows: { label: "Flow", plural: "Data flows", color: "#0d9488", layer: 0 },
  processing: { label: "Processing activity", plural: "Processing activities", color: "#a16207", layer: 6 },
  agreements: { label: "Agreement", plural: "Agreements (DPA)", color: "#854d0e", layer: 6 },
  alerts: { label: "Alert", plural: "Alerts", color: "#ea580c", layer: 7 },
  runbooks: { label: "Runbook", plural: "Runbooks", color: "#c2410c", layer: 7 },
  costs: { label: "Costs", plural: "Costs", color: "#78716c", layer: 7 },
  goals: { label: "Goal", plural: "Goals", color: "#0f172a", layer: 0 },
  phases: { label: "Phase", plural: "Phases", color: "#334155", layer: 0 },
  steps: { label: "Step", plural: "Steps", color: "#2563eb", layer: 1 },
  metrics: { label: "Metric", plural: "Metrics", color: "#0891b2", layer: 0 },
  contracts: { label: "Agreement", plural: "Contracts", color: "#7c3aed", layer: 1 },
  releases: { label: "Release", plural: "Releases", color: "#0f172a", layer: 0 },
  slices: { label: "Slice", plural: "Slices", color: "#4f46e5", layer: 0 },
  features: { label: "Feature", plural: "Features", color: "#6366f1", layer: 1 },
  decisions: { label: "Decision", plural: "Decisions", color: "#57534e", layer: 0 },
  offline: { label: "Non-code task", plural: "Non-code tasks", color: "#78716c", layer: 0 },
  screens: { label: "Screen", plural: "Screens", color: "#0ea5e9", layer: 1 },
  tokens: { label: "Design token", plural: "Design tokens", color: "#ec4899", layer: 0 },
  glossary: { label: "Term", plural: "Glossary", color: "#a8a29e", layer: 0 },
  folders: { label: "Folder", plural: "Repo", color: "#525252", layer: 0 },
  fields: { label: "Field", plural: "Fields", color: "#0284c7", layer: 2 },
  errors: { label: "Error code", plural: "Error codes", color: "#b91c1c", layer: 2 },
}

export type Section = { id: string; label: string; kinds: string[]; mode?: "list" | "graph" }
export type Group = { label: string; sections: Section[] }

export const NAV: Group[] = [
  { label: "Overview", sections: [
    { id: "overview", label: "Overview", kinds: [] },
    { id: "findings", label: "Findings", kinds: [] },
    { id: "history", label: "History", kinds: [] },
  ] },
  { label: "Plan", sections: [
    { id: "roadmap", label: "Step by step", kinds: [] },
    { id: "overviewplan", label: "Timeline", kinds: [] },
    { id: "contracts", label: "Contracts", kinds: ["contracts"], mode: "list" },
    { id: "releases", label: "Releases", kinds: ["releases"], mode: "list" },
    { id: "kanban", label: "Kanban", kinds: ["features", "offline"], mode: "list" },
    { id: "plan", label: "Slices and features", kinds: ["slices", "features"], mode: "list" },
    { id: "decisions", label: "Decisions", kinds: ["decisions", "offline"], mode: "list" },
  ] },
  { label: "Structure", sections: [
    { id: "repo", label: "Repo", kinds: ["folders"], mode: "graph" },
    { id: "system", label: "System", kinds: ["actors", "devices", "apps", "boundaries", "domains"], mode: "graph" },
    { id: "shells", label: "Shells", kinds: ["shells", "controls"], mode: "list" },
    { id: "modules", label: "Modules", kinds: ["modules"], mode: "list" },
    { id: "abstractions", label: "Abstractions", kinds: ["abstractions"], mode: "list" },
  ] },
  { label: "Interfaces", sections: [
    { id: "requests", label: "Trace requests", kinds: [] },
    { id: "routes", label: "Routes", kinds: ["routes"], mode: "list" },
    { id: "jobs", label: "Jobs", kinds: ["jobs"], mode: "list" },
    { id: "externals", label: "External services", kinds: ["externals"], mode: "list" },
  ] },
  { label: "Data", sections: [
    { id: "database", label: "Database", kinds: ["tables"], mode: "list" },
    { id: "dataflow", label: "Data flow", kinds: [] },
    { id: "classes", label: "Data classes", kinds: ["classes"], mode: "list" },
  ] },
  { label: "Access", sections: [
    { id: "roles", label: "Roles and permissions", kinds: ["roles", "permissions", "principal_types"], mode: "list" },
  ] },
  { label: "Operations", sections: [
    { id: "infra", label: "Infrastructure", kinds: ["resources", "environments", "secrets"], mode: "graph" },
    { id: "deploy", label: "Deployment", kinds: ["paths", "deploysteps"], mode: "graph" },
    { id: "ops", label: "Alerts and runbooks", kinds: ["alerts", "runbooks", "costs"], mode: "list" },
  ] },
  { label: "Security", sections: [
    { id: "controls", label: "Controls and checks", kinds: ["controls", "checks"], mode: "list" },
    { id: "threats", label: "Threats", kinds: ["threats"], mode: "graph" },
  ] },
  { label: "Flows", sections: [
    { id: "flows", label: "Data flows", kinds: ["flows"], mode: "list" },
  ] },
  { label: "Legal", sections: [
    { id: "legal", label: "Processing and DPAs", kinds: ["processing", "agreements"], mode: "list" },
  ] },
  { label: "UI", sections: [
    { id: "screens", label: "Screens", kinds: ["screens"], mode: "list" },
    { id: "tokens", label: "Design tokens", kinds: ["tokens"], mode: "list" },
    { id: "glossary", label: "Glossary", kinds: ["glossary"], mode: "list" },
  ] },
]

export const SECTIONS = NAV.flatMap((g) => g.sections.map((s) => ({ ...s, group: g.label })))

export function sectionOfKind(kind: string) {
  return SECTIONS.find((s) => s.kinds.includes(kind))
}

export const FIELD_LABELS: Record<string, string> = {
  uses: "uses", clients: "Clients", calls: "calls", served_by: "served by", runs_on: "runs on", reads: "reads/writes", writes: "writes",
  sends_via: "sends via", shell: "Shell", controls: "Controls", may_use: "may use", slice: "Slice", module: "Module",
  permission: "Permission", callers: "Callers", owner: "Owner", trigger: "triggered by", grants: "grants",
  principal: "Principal type", data: "Data classes", runs: "runs", target: "Goal", gate: "Gate", check: "Check",
  mitigated_by: "mitigated by", steps: "Steps", tables: "Tables", subprocessors: "Subprocessors", covers: "covers",
  source: "Source", watches: "watches", modules: "Modules", routes: "Routes", checks: "Checks", flows: "Flows", jobs: "Jobs",
  affects: "affects", goals: "Goals", phase: "Phase", step: "Step", metrics: "Metrics", bucket: "Bucket", release: "Release", gates: "Gates", requires: "requires", target_date: "Target date", disposition: "Decision", suggestion: "Suggestion", app: "App", targets: "Goals", contains: "contains", parent: "located in", repo: "Repo folder", serves: "serves",
  used_by: "used by", notify: "notifies", path: "Path",
}
