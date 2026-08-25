import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { formatDate } from "@brazil-tms/shared";
import { verifySession } from "@/lib/auth/session";
import { NOVIDADES } from "@/lib/novidades/entradas";
import { COOKIE_NOVIDADES, ehNova } from "@/lib/novidades/visto";
import { MarcarComoVisto } from "@/components/novidades/marcar-como-visto";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/**
 * NOVIDADES — o que mudou no TMS (2026-08-25, a pedido).
 *
 * ── SEM GUARDA DE PERMISSÃO, E ISSO É DE PROPÓSITO ────────────────────────────────────────────
 *
 * Todas as outras telas pedem uma chave, porque cada uma mostra um recorte do negócio. Esta não
 * mostra dado nenhum: mostra o que o sistema passou a fazer. Quem usa o TMS convive com as mudanças
 * queira ou não, então esconder a lista de parte das pessoas só garante que elas descubram a
 * mudança tropeçando nela.
 *
 * Uma entrada que precise falar de uma tela restrita continua legível — ela diz onde a coisa está,
 * não o que tem lá dentro.
 *
 * ── DESENHADA NO SERVIDOR ─────────────────────────────────────────────────────────────────────
 *
 * A lista é constante em arquivo: não há o que buscar, nada muda enquanto a página está aberta, e
 * uma tela que só lê não precisa de estado. O único pedaço que exige navegador é o carimbo de
 * "já vi" — e ele é um componente à parte que não desenha nada. Ver `marcar-como-visto.tsx`.
 */
export default async function NovidadesPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");

  const t = await getTranslations("Novidades");
  const ultimaVista = (await cookies()).get(COOKIE_NOVIDADES)?.value;

  // A mais recente é a PRIMEIRA do arquivo, não o maior valor de `data`: a ordem é editorial, e
  // reordenar aqui contradiria o arquivo. Ver o comentário de `entradas.ts`.
  const maisRecente = NOVIDADES[0]?.data ?? "";
  const novas = NOVIDADES.filter((n) => ehNova(n.data, ultimaVista, maisRecente)).length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>

      {/* O resumo só aparece quando há o que resumir: "0 novidades desde a sua última visita" é uma
          frase que ocupa espaço para não dizer nada. */}
      {novas > 0 ? (
        <p className="text-sm text-muted-foreground">{t("desdeSuaVisita", { count: novas })}</p>
      ) : null}

      <ol className="space-y-2.5">
        {NOVIDADES.map((n) => {
          const nova = ehNova(n.data, ultimaVista, maisRecente);
          return (
            <li key={`${n.data}-${n.titulo}`}>
              <Card className="p-3.5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant={n.tipo === "novidade" ? "default" : "secondary"}>
                    {t(n.tipo === "novidade" ? "tipoNovidade" : "tipoCorrecao")}
                  </Badge>
                  <h2 className="font-medium leading-tight">{n.titulo}</h2>
                  {nova ? (
                    <Badge variant="outline" className="border-success text-success">
                      {t("selo")}
                    </Badge>
                  ) : null}
                  {/* A data vai para a direita e em `tabular-nums`: são dezesseis linhas, e com
                      dígitos de larguras diferentes elas não se alinham na leitura vertical. */}
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatDate(`${n.data}T12:00:00Z`)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{n.descricao}</p>
                {n.onde ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    <span className="font-medium">{t("onde")}</span> {n.onde}
                  </p>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ol>

      <MarcarComoVisto data={maisRecente} />
    </div>
  );
}
