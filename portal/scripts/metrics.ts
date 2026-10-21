import { join } from "node:path"
import { computeMetrics } from "./metrics-core"

const res = computeMetrics(join(import.meta.dirname, "../../architecture"))
let failed = 0
for (const r of res) {
  const worse = r.current !== null && r.current > (r.cap ? r.target : r.baseline)
  if (worse) failed++
  console.log(`${(worse ? "WORSE" : "ok").padEnd(10)} ${r.name.padEnd(42)} Start ${String(r.baseline).padStart(6)}  now ${String(r.current ?? "–").padStart(6)}  Target ${String(r.target).padStart(6)}  ${r.progress === null ? r.note ?? "" : Math.round(r.progress * 100) + " %"}`)
}
process.exit(failed ? 1 : 0)
