import { AuthClient, type Session } from "@supabase/auth-js"

export type { Session }

export function createAuth(url: string) {
  const client = new AuthClient({ url, persistSession: true, autoRefreshToken: true, flowType: "pkce" })
  const throwing = async <T extends { error: Error | null }>(p: Promise<T>) => {
    const r = await p
    if (r.error) throw r.error
    return r
  }
  return {
    session: async () => (await client.getSession()).data.session,
    token: async () => (await client.getSession()).data.session?.access_token,
    onChange: (fn: (s: Session | null) => void) => client.onAuthStateChange((_, s) => fn(s)).data.subscription.unsubscribe,
    guest: () => throwing(client.signInAnonymously()),
    emailCode: (email: string) => throwing(client.signInWithOtp({ email, options: { shouldCreateUser: true } })),
    verifyEmailCode: (email: string, token: string) => throwing(client.verifyOtp({ email, token, type: "email" })),
    provider: (provider: "apple" | "google", redirectTo: string) => throwing(client.signInWithOAuth({ provider, options: { redirectTo } })),
    signOut: () => throwing(client.signOut()),
  }
}

export type Auth = ReturnType<typeof createAuth>
