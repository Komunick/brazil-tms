"use client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AvisosProvider, avisar } from "@/lib/ui/avisos";

/**
 * TanStack Query provider. Freshness is polling only — NO Supabase Realtime (Constitution).
 * Conservative defaults for low-velocity admin lists.
 */

/**
 * TODA GRAVAÇÃO AVISA SE DEU CERTO (2026-08-24, a pedido).
 *
 * ── UM PONTO, NÃO CEM ─────────────────────────────────────────────────────────────────────────
 *
 * O app tem 100 `useMutation` em 23 arquivos. Pendurar um aviso em cada um seria escrever a mesma
 * coisa cem vezes e, pior, DEPENDER de alguém lembrar na tela número 101 — e a esquecida volta a
 * salvar em silêncio, que é exatamente o problema que isto resolve.
 *
 * O `MutationCache` é o lugar onde toda gravação passa, sem exceção. Uma tela nova ganha o aviso de
 * graça, sem uma linha a mais.
 *
 * ── SÓ GRAVAÇÃO, NUNCA LEITURA ────────────────────────────────────────────────────────────────
 *
 * Nada aqui toca `queries`. As telas se recarregam sozinhas de minuto em minuto, e um aviso por
 * leitura encheria o canto da tela com "concluído" que ninguém pediu — em uma hora seriam sessenta.
 * O aviso responde a uma pergunta que só existe depois de um clique: "pegou?".
 *
 * ── O QUE O AVISO DIZ ─────────────────────────────────────────────────────────────────────────
 *
 * Por padrão, o genérico. Quem quiser nomear a ação declara na própria mutação:
 *
 *     useMutation({ mutationFn: ..., meta: { aviso: "Motorista atualizado" } })
 *
 * Sem `meta`, o texto é "Concluído" / "Não foi possível concluir" — que já responde a pergunta. Com
 * `meta`, fica melhor. Foi escolhido assim para as 100 mutações existentes ganharem o aviso HOJE, e
 * o texto específico chegar aos poucos, onde valer a pena.
 *
 * ── O MOTIVO DO ERRO VEM DO SERVIDOR, quando ele diz ──────────────────────────────────────────
 *
 * `TripsError` carrega o CÓDIGO (`ASSIGNMENT_BLOCKED`), não a frase. Traduzir os códigos aqui
 * duplicaria catálogos que já existem nas telas — então o aviso mostra o código apenas quando a
 * mutação não declarou nada melhor. É informação para quem for pedir ajuda, não para quem opera; a
 * tela que conhece o código continua explicando direito, ao lado do formulário.
 */
const mutationCache = new MutationCache({
  onSuccess: (_dados, _variaveis, _contexto, mutation) => {
    if (ehSilenciosa(mutation.meta)) return;
    avisar({ tipo: "ok", texto: textoDaMutacao(mutation.meta) });
  },
  onError: (erro, _variaveis, _contexto, mutation) => {
    if (ehSilenciosa(mutation.meta)) return;
    avisar({
      tipo: "erro",
      texto: textoDaMutacao(mutation.meta),
      detalhe: motivoLegivel(erro),
    });
  },
});

/**
 * NEM TODA MUTAÇÃO GRAVA ALGUMA COISA — e a primeira versão disto avisava as duas.
 *
 * `useAssignmentCheck` é um POST que só CONFERE: pergunta ao servidor se aquele motorista e aquele
 * caminhão podem pegar a viagem, e não escreve nada. Ele roda com atraso curto a cada troca de
 * recurso no formulário — então escolher um motorista fazia pipocar "Concluído" no canto sem nada
 * ter sido atribuído, e o aviso passava a mentir sobre a única coisa que ele existe para dizer.
 *
 * Quem só lê declara `meta: { silencioso: true }`. É opt-out e não opt-in de propósito: o padrão
 * tem de ser avisar, senão a tela nova nasce muda de novo — e "esqueci de silenciar uma conferência"
 * é um incômodo visível, enquanto "esqueci de avisar numa gravação" é o defeito calado que este
 * mecanismo veio consertar.
 */
function ehSilenciosa(meta: Record<string, unknown> | undefined): boolean {
  return meta?.silencioso === true;
}

function textoDaMutacao(meta: Record<string, unknown> | undefined): string | undefined {
  const aviso = meta?.aviso;
  return typeof aviso === "string" && aviso.trim() !== "" ? aviso : undefined;
}

/**
 * Um erro de rede não tem código, e "Failed to fetch" não é frase para operação ler. Nesse caso o
 * aviso fica só com o texto padrão — que já diz o essencial, que é "não foi".
 */
function motivoLegivel(erro: unknown): string | undefined {
  if (!(erro instanceof Error)) return undefined;
  const codigo = (erro as { code?: unknown }).code;
  if (typeof codigo === "string" && codigo.trim() !== "") return codigo;
  return undefined;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        mutationCache,
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AvisosProvider>{children}</AvisosProvider>
    </QueryClientProvider>
  );
}
