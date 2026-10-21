export type Config = { apiUrl: string; authUrl: string }

export function readConfig(raw: Record<string, unknown>): Config {
  const need = (k: keyof Config) => {
    const v = raw[k]
    if (typeof v !== "string" || !v) throw new Error(`${k} is missing`)
    const u = new URL(v)
    if (u.protocol !== "https:" && u.hostname !== "localhost") throw new Error(`${k} must use https`)
    return v.replace(/\/$/, "")
  }
  return { apiUrl: need("apiUrl"), authUrl: need("authUrl") }
}

export async function loadConfig(): Promise<Config> {
  const res = await fetch("/config.json", { cache: "no-store" })
  if (!res.ok) throw new Error(`config.json: ${res.status}`)
  return readConfig(await res.json())
}
