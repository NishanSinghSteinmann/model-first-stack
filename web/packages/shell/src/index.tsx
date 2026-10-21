import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { loadConfig } from "./config"
import { BaseProvider } from "./context"

export { BaseStatus } from "./status"
export { readConfig } from "./config"
export { useApi, useAuth, useSession } from "./context"

export async function mount(app: ReactNode) {
  const config = await loadConfig()
  const queries = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } })
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queries}>
        <BaseProvider config={config}>{app}</BaseProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}
