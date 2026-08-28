"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type VinculoEscolhido = "owned" | "agregado" | "terceiro";

/**
 * FROTA · AGREGADO · TERCEIRO — a classificação que a gerenciadora exige (2026-08-25, fatia 026).
 *
 * A Logae recusa criar a solicitação de monitoramento sem saber o que é cada veículo, carreta e
 * motorista. O nosso cadastro distinguia só "nosso" de "de fora", então 1.246 veículos e 405
 * motoristas estão sem classificação — e o jeito de resolver isso, decidido com o usuário, é
 * perguntar a quem escala, uma vez por recurso.
 *
 * ── TRÊS BOTÕES, NÃO UMA LISTA ────────────────────────────────────────────────────────────────
 *
 * São três opções curtas e mutuamente exclusivas, e este campo aparece até CINCO vezes no mesmo
 * diálogo (cavalo, duas carretas, dois motoristas). Cinco listas suspensas empilhadas viram cinco
 * cliques e um formulário que ninguém termina; três botões respondem com um toque e mostram a
 * escolha sem abrir nada.
 *
 * ── VAZIO NÃO É ERRO, E POR ISSO NÃO É VERMELHO ───────────────────────────────────────────────
 *
 * Um recurso sem classificação é o estado NORMAL de quase todo o cadastro hoje. Pintar de vermelho
 * transformaria a tela num campo de alarmes no primeiro dia, e a pessoa aprenderia a ignorá-los.
 * A consequência de deixar vazio é dita em texto, uma vez, embaixo: a viagem não gera Pré-SM.
 *
 * ── QUEM JÁ FOI CLASSIFICADO CONTINUA EDITÁVEL (mudou em 2026-08-28, a pedido) ────────────────
 *
 * Aqui o componente virava TEXTO quando o recurso já tinha classificação: mostrava o valor e
 * sumia com os botões. O argumento era que trocar é operação de cadastro, na tela do recurso,
 * onde há histórico — e não efeito colateral de escalar.
 *
 * O argumento tinha um custo que só apareceu no uso: uma classificação errada não podia ser
 * corrigida de onde ela é notada. Quem estava atribuindo via "agregado" onde devia ser frota,
 * não conseguia mexer, e a atribuição seguia com o dado errado — nas palavras do usuário, "fica
 * travado".
 *
 * Agora os três botões aparecem sempre, com o valor atual marcado. O que veio do cadastro é dito
 * em texto ao lado, para a pessoa saber que está mudando algo que já existia — e não achar que
 * está preenchendo um campo vazio.
 */
export function VinculoDoRecurso({
  valor,
  aoEscolher,
  jaClassificado,
  rotulo,
}: {
  valor: VinculoEscolhido | null;
  aoEscolher: (v: VinculoEscolhido) => void;
  /** Veio do cadastro, não desta tela — mostra e não pede. */
  jaClassificado: boolean;
  /** Qual recurso: "Cavalo", "Carreta 1", "Motorista"… */
  rotulo: string;
}) {
  const t = useTranslations("Trips.vinculo");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{rotulo}:</span>
      {(["owned", "agregado", "terceiro"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => aoEscolher(v)}
          aria-pressed={valor === v}
          className={cn(
            "rounded border px-2 py-0.5 text-xs transition-colors",
            valor === v
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input hover:bg-muted",
          )}
        >
          {t(v)}
        </button>
      ))}
      {/*
        DIZ QUE O VALOR VEIO DO CADASTRO, e não desta tela.

        Sem isso, o botão marcado parece uma escolha que a pessoa acabou de fazer, e trocar viraria
        um clique sem peso. Com a palavra ali, ela sabe que está corrigindo um registro que já
        existe — que é justamente a operação que estava faltando.
      */}
      {jaClassificado && valor ? (
        <span className="text-[0.65rem] text-muted-foreground">{t("doCadastro")}</span>
      ) : null}
    </div>
  );
}
