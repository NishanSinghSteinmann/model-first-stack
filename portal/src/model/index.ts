import { buildModel } from "./core"

const raw = import.meta.glob("../../../architecture/*.yaml", { query: "?raw", import: "default", eager: true }) as Record<string, string>

const files = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.split("/").pop()!, v]))

export const model = buildModel(files)
