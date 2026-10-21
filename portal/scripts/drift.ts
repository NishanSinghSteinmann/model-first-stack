import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { buildModel } from "../src/model/core"

const root = join(import.meta.dirname, "../..")
const dir = join(root, "architecture")
const m = buildModel(Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => [f, readFileSync(join(dir, f), "utf8")])))
const active = (s: string) => ["wip", "built", "verified"].includes(s)
let drift = 0
const report = (kind: string, name: string, msg: string) => { drift++; console.log(`${kind.padEnd(8)} ${name.padEnd(40)} ${msg}`) }

const migrations = join(root, "backend/internal/platform/data/migrations")
if (existsSync(migrations)) {
  const sql = readdirSync(migrations).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(join(migrations, f), "utf8")).join("\n")
  const inCode = new Set([...sql.matchAll(/create table (?:if not exists )?"?(\w+)"?/gi)].map((x) => x[1].toLowerCase()))
  const inModel = new Set(m.elements.filter((e) => e.kind === "tables" && active(e.status) && e.raw.managed !== "external").map((e) => e.name))
  for (const t of inCode) if (!inModel.has(t)) report("Table", t, "in migrations, missing from model")
  for (const t of inModel) if (!inCode.has(t)) report("Table", t, "in model, not migrated yet")
} else console.log("migrations directory missing, table comparison skipped")

const spec = join(root, "contracts/openapi.yaml")
if (existsSync(spec)) {
  const text = readFileSync(spec, "utf8")
  const paths = new Set([...text.matchAll(/^  (\/[^:]+):\s*$/gm)].map((x) => x[1]))
  for (const r of m.elements.filter((e) => e.kind === "routes" && active(e.status))) if (!paths.has((r.raw.unversioned ? "" : "/v1") + String(r.raw.path))) report("Route", `${r.raw.method} ${r.raw.path}`, "in model, missing from openapi.yaml")
} else console.log("contracts/openapi.yaml missing, route comparison skipped")

const modules = join(root, "backend/internal/modules")
if (existsSync(modules)) {
  const pkgs = new Set(readdirSync(modules))
  for (const mod of m.elements.filter((e) => e.kind === "modules" && active(e.status))) {
    const name = String(mod.raw.package).split("/").pop()!
    if (!pkgs.has(name)) report("Module", name, "in model, package missing")
  }
  for (const p of pkgs) if (!m.elements.some((e) => e.kind === "modules" && String(e.raw.package).endsWith("/" + p))) report("Module", p, "package without model entry")
} else console.log("backend/internal/modules missing, module comparison skipped")

console.log(`${drift} drifts`)
process.exit(drift ? 1 : 0)
