import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { buildModel } from "../src/model/core"

const dir = join(import.meta.dirname, "../../architecture")
const files = Object.fromEntries((existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith(".yaml")).map((f) => [f, readFileSync(join(dir, f), "utf8")]))
const m = buildModel(files)
const by = { error: 0, warning: 0, info: 0 }
for (const f of m.findings) {
  by[f.severity]++
  console.log(`${f.severity.padEnd(7)} ${f.element.padEnd(32)} ${f.rule}: ${f.message}`)
}
console.log(`\n${m.elements.length} elements, ${m.edges.length} connections, ${by.error} errors, ${by.warning} warnings, ${by.info} infos`)
process.exit(by.error ? 1 : 0)
