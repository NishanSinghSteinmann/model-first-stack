import createClient, { type Middleware } from "openapi-fetch"
import type { components, paths } from "./schema.gen"

export type { components, paths }
export type Problem = components["schemas"]["Problem"]

export function createApi(baseUrl: string, token: () => Promise<string | undefined>, clientVersion: string) {
  const client = createClient<paths>({ baseUrl })
  const auth: Middleware = {
    async onRequest({ request }) {
      request.headers.set("X-Client-Version", clientVersion)
      const t = await token()
      if (t) request.headers.set("Authorization", `Bearer ${t}`)
      return request
    },
  }
  client.use(auth)
  return client
}

export type Api = ReturnType<typeof createApi>

export function idempotencyKey() {
  return crypto.randomUUID()
}
