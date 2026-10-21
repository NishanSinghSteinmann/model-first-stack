import { createApi, type Api } from "@app/api"
import { createAuth, type Auth, type Session } from "@app/auth"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Config } from "./config"

type Base = { api: Api; auth: Auth }

const BaseContext = createContext<Base | null>(null)

export function BaseProvider({ config, children }: { config: Config; children: ReactNode }) {
  const [base] = useState<Base>(() => {
    const auth = createAuth(config.authUrl)
    return { auth, api: createApi(config.apiUrl, auth.token, `web/${__APP_VERSION__}`) }
  })
  return <BaseContext.Provider value={base}>{children}</BaseContext.Provider>
}

function useBase() {
  const b = useContext(BaseContext)
  if (!b) throw new Error("BaseProvider is missing")
  return b
}

export const useApi = () => useBase().api
export const useAuth = () => useBase().auth

export function useSession() {
  const auth = useAuth()
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    void auth.session().then(setSession)
    return auth.onChange(setSession)
  }, [auth])
  return session
}
