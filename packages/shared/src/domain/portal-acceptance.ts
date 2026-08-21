/**
 * ACEITAR E REJEITAR SEM ABRIR O PORTAL (2026-08-21).
 *
 * A operação decide isso o dia inteiro e hoje decide em outra aba, num sistema que não registra quem
 * decidiu nem por quê. São 617 viagens esperando. Este módulo guarda as regras de QUANDO cabe cada
 * botão e QUAIS motivos o portal aceita — sob teste, longe da tela e longe do robô.
 */

/**
 * O rótulo de "esperando decisão" vem de `trip-display-status`, que já o define para desdobrar
 * "Recebida" em "Em análise". Redefinir aqui criaria duas fontes para a MESMA palavra do cliente —
 * e o dia em que ele trocasse "Pending" por outra coisa, metade do sistema aprenderia e a outra
 * metade não.
 */
export { ACEITACAO_PENDENTE } from "./trip-display-status";
import { ACEITACAO_PENDENTE } from "./trip-display-status";

/** O outro lado do eixo: já aceita, e portanto fora do alcance destes botões. */
export const ACEITACAO_ACEITA = "Accepted";

export type PortalAction = "accept" | "reject";

/**
 * OS MOTIVOS DE RECUSA SÃO DO PORTAL, não nossos.
 *
 * Ele serve a lista em `/api/admin/transportation/reason/trip_reject/list` e recusa qualquer id fora
 * dela. Os três abaixo foram lidos de lá em 2026-08-21. Ficam fixos AQUI, e não numa tabela de
 * configuração, por uma razão: são três, mudam quando o cliente muda o processo dele, e uma tela de
 * cadastro para três linhas que ninguém controla é cerimônia sem dono.
 *
 * O id é o que vai no POST; o rótulo é o que a operação lê. Se o cliente acrescentar um quarto, o
 * sintoma é claro — ele aparece no portal e não aqui — e o conserto é uma linha.
 */
export const MOTIVOS_DE_RECUSA = [
  { id: 4, rotulo: "Indisponibilidade do veículo" },
  { id: 5, rotulo: "Cotação de rota pendente" },
  { id: 6, rotulo: "Rota Nova. Prazo curto para preparação" },
] as const;

export type MotivoDeRecusa = (typeof MOTIVOS_DE_RECUSA)[number]["id"];

export function motivoValido(id: number | null | undefined): id is MotivoDeRecusa {
  return MOTIVOS_DE_RECUSA.some((m) => m.id === id);
}

export function rotuloDoMotivo(id: number | null | undefined): string | null {
  return MOTIVOS_DE_RECUSA.find((m) => m.id === id)?.rotulo ?? null;
}

/** O que a viagem precisa carregar para o TMS poder mandar no portal por ela. */
export interface AlvoDaAcao {
  /** `Aceitação (portal)` — "Pending", "Accepted", ou ausente. */
  acceptanceStatus: string | null | undefined;
  /** `ID (portal)` — o inteiro com que o portal se endereça. */
  portalTripId: string | null | undefined;
  /** Já existe ordem pendente ou em execução para esta viagem? */
  temOrdemAberta: boolean;
}

export type ImpedimentoDaAcao =
  /** A viagem não está esperando decisão — ou já foi aceita, ou nunca passou pelo portal. */
  | "nao_esta_pendente"
  /** Nasceu de planilha ou de criação manual: não existe do lado do portal. */
  | "sem_id_do_portal"
  /** Já tem uma ordem em voo. Duas ordens viram dois POSTs, e aceitar duas vezes não se desfaz. */
  | "ordem_em_andamento";

/**
 * Por que esta viagem NÃO pode ser aceita/rejeitada daqui — ou `null` quando pode.
 *
 * Devolve o motivo em vez de um booleano porque a tela precisa dizer QUAL é o impedimento. Um botão
 * cinza sem explicação faz a pessoa ir ao portal conferir, que é exatamente o passo que este recurso
 * existe para eliminar.
 */
export function impedimentoDaAcao(alvo: AlvoDaAcao): ImpedimentoDaAcao | null {
  if ((alvo.acceptanceStatus ?? "") !== ACEITACAO_PENDENTE) return "nao_esta_pendente";
  if (!(alvo.portalTripId ?? "").trim()) return "sem_id_do_portal";
  if (alvo.temOrdemAberta) return "ordem_em_andamento";
  return null;
}

export const podeAgir = (alvo: AlvoDaAcao): boolean => impedimentoDaAcao(alvo) === null;
