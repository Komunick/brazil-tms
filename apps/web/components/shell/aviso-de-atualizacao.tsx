"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { avisoDaAtualizacao, type AvisoDaAtualizacao } from "@brazil-tms/shared";

/**
 * A FAIXA DA JANELA DE ATUALIZAÇÃO (03/09, a pedido).
 *
 * Das 12:00 às 12:10, todo dia, uma faixa no topo diz que a janela está chegando. Às 12:10 ela some
 * sozinha.
 *
 * ── ELA NÃO BLOQUEIA NADA, e isso é a decisão principal ───────────────────────────────────────
 *
 * Fica no fluxo, empurrando o conteúdo para baixo — não por cima dele. Quem está atribuindo uma
 * viagem continua atribuindo. É a lição que a fatia do cartão de spot deixou: o aviso que cobria a
 * tela virou reclamação no primeiro dia, e o pedido foi explícito em não repetir isso.
 *
 * ── SEM BOTÃO DE FECHAR ───────────────────────────────────────────────────────────────────────
 *
 * São dez minutos por dia, e a faixa não atrapalha. Um botão de fechar transformaria o aviso em algo
 * que a pessoa dispensa por reflexo às 12:01 e esquece às 12:09 — que é o minuto em que ele serve.
 *
 * ── A REDAÇÃO É SOBRE A JANELA, NÃO SOBRE UM DEPLOY ───────────────────────────────────────────
 *
 * O aviso aparece todo dia, inclusive quando nada é atualizado. Dizer "o sistema VAI reiniciar"
 * seria mentira na maioria dos dias, e aviso que mente todo dia deixa de ser lido — a operação
 * aprende a ignorá-lo justamente antes do dia em que ele importa. Por isso o texto fala em *janela*
 * e em *pode reiniciar*, que é verdade sempre.
 */
export function AvisoDeAtualizacao() {
  const t = useTranslations("AvisoDeAtualizacao");
  const [aviso, setAviso] = useState<AvisoDaAtualizacao | null>(null);

  useEffect(() => {
    /*
      DEZ SEGUNDOS.

      A conta é de minutos, então bastaria um intervalo grosso — mas com 60 s a faixa poderia nascer
      até um minuto atrasada para quem abriu a tela às 11:59:55, e o último minuto é o que importa.
      Dez segundos custam nada: é uma comparação de datas, sem rede e sem banco.
    */
    const conferir = (): void => setAviso(avisoDaAtualizacao(new Date()));
    conferir();
    const t = setInterval(conferir, 10_000);
    return () => clearInterval(t);
  }, []);

  /*
    NADA RENDERIZADO fora da janela — que são 23 h e 50 min do dia.

    O `null` também cobre a primeira pintura no servidor: o estado começa vazio e só é preenchido
    pelo efeito, no navegador. Sem isso, o HTML do servidor (em UTC) e o do cliente (em São Paulo)
    discordariam, e o React reclamaria de hidratação justamente às 12h.
  */
  if (!aviso) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 md:px-6 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
    >
      <TriangleAlert className="size-4 shrink-0" />
      <span>{t("mensagem", { minutos: aviso.minutosRestantes, horario: aviso.horario })}</span>
    </div>
  );
}
