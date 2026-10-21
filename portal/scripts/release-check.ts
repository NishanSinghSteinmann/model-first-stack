import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { buildModel, releaseStatus } from "../src/model/core"

const dir = join(import.meta.dirname, "../../architecture")
const m = buildModel(Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => [f, readFileSync(join(dir, f), "utf8")])))
const arg = process.argv[2] ?? ""
const id = arg.startsWith("release.") ? arg : `release.${arg.replace(".", "-")}`
const s = releaseStatus(m, id)
console.log(`${s.release.name}: ${s.ready ? "release ready" : "blocked"}`)
for (const f of s.open) console.log(`  open          ${f.name} (${f.status})`)
for (const b of s.blockers) console.log(`  required      ${b.name} (${b.status})`)
for (const e of s.errors) console.log(`  error         ${e.element}: ${e.rule}`)
process.exit(s.ready ? 0 : 1)
