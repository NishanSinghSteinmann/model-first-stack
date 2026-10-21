import { t } from "@app/i18n"
import { Button } from "@app/ui"
import { useQuery } from "@tanstack/react-query"
import { useApi, useAuth, useSession } from "./context"

export function BaseStatus({ title }: { title: string }) {
  const api = useApi()
  const auth = useAuth()
  const session = useSession()
  const live = useQuery({ queryKey: ["livez"], queryFn: async () => (await api.GET("/livez")).data ?? null })
  const who = !session ? t("base.session.none") : session.user.is_anonymous ? t("base.session.guest") : t("base.session.user")
  return (
    <main className="min-h-dvh bg-background text-foreground font-sans grid place-items-center p-4">
      <section className="w-full max-w-sm rounded-lg bg-card text-card-foreground border border-border p-6 space-y-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">{t("base.api")}</dt>
          <dd>{live.data?.status === "ok" ? t("base.api.ok") : t("base.api.down")}</dd>
          <dt className="text-muted-foreground">{t("base.session")}</dt>
          <dd>{who}</dd>
        </dl>
        {session ? (
          <Button variant="secondary" onClick={() => void auth.signOut()}>{t("base.signout")}</Button>
        ) : (
          <Button onClick={() => void auth.guest()}>{t("base.guest")}</Button>
        )}
      </section>
    </main>
  )
}
