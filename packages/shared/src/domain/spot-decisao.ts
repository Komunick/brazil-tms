import { ACEITACAO_ACEITA, ACEITACAO_PENDENTE } from "./portal-acceptance";

/**
 * EM QUE PÉ ESTÁ A DECISÃO SOBRE UMA OFERTA DE SPOT (2026-09-01, a pedido).
 *
 * O leilão de spot tem prazo curto: quem responde primeiro leva. O cartão que avisa passa a ser o
 * lugar onde a decisão acontece — aceitar ou ignorar —, e para isso ele precisa saber em que pé a
 * oferta está.
 *
 * ── O ESTADO É DERIVADO. NÃO EXISTE COLUNA QUE O GUARDE, E ISSO É O PONTO ─────────────────────
 *
 * As cinco situações abaixo saem de dados que já estavam gravados antes desta fatia existir:
 * `Aceitação (portal)` na viagem, e a fila de ordens em `portal_commands`. Nada aqui é copiado para
 * uma tabela nossa.
 *
 * Parece economia e não é: é a única forma de garantir o FR-014, que diz que o cartão sai de todas
 * as telas quando o portal confirmar o aceite, e por nenhuma outra DECISÃO.
 *
 *   **`aceito` NUNCA é escrito por nós.** Ele é lido do que o portal disse. Não havendo onde
 *   gravá-lo, não existe uma segunda decisão capaz de tirar o cartão da tela — a garantia é por
 *   construção, não por disciplina.
 *
 * E o caso que quebraria uma cópia é o COMUM, não o raro: medido em 01/09, das 19 ofertas dos dois
 * dias anteriores, quase todas foram aceitas DIRETO NO PORTAL, sem passar pelo TMS. Uma coluna nossa
 * de "aceita" continuaria dizendo "esperando" para sempre, e o cartão nunca sairia da tela.
 *
 * ── A ÚNICA COISA QUE TIRA O CARTÃO SEM SER DECISÃO ──────────────────────────────────────────
 *
 * A virada do dia. A leitura das ofertas é recortada pelo dia em São Paulo, então uma oferta não
 * decidida sai da tela na virada. É recorte de leitura, não decisão de ninguém, é deliberado (leilão
 * de ontem é leilão morto), e está declarado no FR-001. Não mora aqui: esta função não conhece
 * relógio.
 */
export const ESTADOS_DA_OFERTA = [
  /** Não há viagem no TMS com este número de LH. Sem viagem não há como endereçar a ordem. */
  "sem_viagem",
  /** A viagem está esperando decisão e não há ordem em voo: dá para aceitar. */
  "esperando",
  /** Há ordem de aceite em voo. O cartão FICA, dizendo que espera o portal. */
  "enviado",
  /** A última ordem de aceite voltou recusada, e não há outra em voo. Dá para tentar de novo. */
  "recusado",
  /** O portal diz `Accepted`. O cartão sai da tela de todas as pessoas. */
  "aceito",
] as const;

export type EstadoDaOferta = (typeof ESTADOS_DA_OFERTA)[number];

/**
 * O que se sabe da oferta no momento da leitura. Os quatro campos vêm de tabelas que já existiam.
 */
export interface SituacaoDaOferta {
  /** `trips.id` da viagem com aquele `external_trip_id`, ou nulo quando ela ainda não chegou. */
  readonly tripId: string | null | undefined;
  /** `trips.customer_fields->>'Aceitação (portal)'` — "Pending", "Accepted", ou ausente. */
  readonly aceitacaoDoPortal: string | null | undefined;
  /** Há ordem de aceite com status `pending` ou `sent` para esta viagem? */
  readonly ordemAberta: boolean;
  /** A última ordem de aceite terminou em falha? (só importa quando não há ordem aberta) */
  readonly ultimaFalhou: boolean;
}

/**
 * `Accepted` VENCE TUDO, e a ordem dos testes abaixo não é estilo.
 *
 * Uma viagem aceita com uma ordem recusada pendurada continua sendo `aceito`: a verdade é do portal,
 * e a ordem é só o nosso pedido. Testar a falha antes da aceitação deixaria o cartão de uma viagem
 * já nossa pendurado na tela mostrando um erro que não interessa mais a ninguém.
 *
 * `sem_viagem` vem logo em seguida porque sem viagem os outros três campos não têm o que descrever —
 * não há ordem possível sem alguém a quem endereçá-la.
 */
export function estadoDaOferta(situacao: SituacaoDaOferta): EstadoDaOferta {
  if ((situacao.aceitacaoDoPortal ?? "") === ACEITACAO_ACEITA) return "aceito";
  if (!situacao.tripId) return "sem_viagem";
  if (situacao.ordemAberta) return "enviado";
  if (situacao.ultimaFalhou) return "recusado";
  return (situacao.aceitacaoDoPortal ?? "") === ACEITACAO_PENDENTE ? "esperando" : "sem_viagem";
}

/**
 * Dá para MANDAR uma ordem de aceite a partir deste cartão?
 *
 * É conveniência da tela, e não a autoridade: quem decide de verdade é o servidor, no mesmo guarda
 * que a tela de viagem já usa (`impedimentoDaAcao`). Um cliente que ignorasse esta função não
 * conseguiria aceitar o que não pode — ela existe para o botão poder DIZER por que está desligado,
 * que é o que evita a ida ao portal para descobrir.
 *
 * `recusado` conta como podendo: a recusa tem duas causas possíveis — corrida perdida ou estado
 * velho do nosso lado — e a tela não sabe qual. Quem está olhando decide se tenta de novo.
 */
export function podeMandarAceite(situacao: SituacaoDaOferta): boolean {
  const estado = estadoDaOferta(situacao);
  return estado === "esperando" || estado === "recusado";
}

/**
 * A DECISÃO FICA DEZ SEGUNDOS NA TELA DE TODOS, antes de a oferta sair (2026-09-02, a pedido).
 *
 * ── O DEFEITO QUE ISTO CORRIGE ────────────────────────────────────────────────────────────────
 *
 * Nas palavras do usuário: "agora você aperta ignorar e só some". Quem clicava via o cartão sumir;
 * para o resto da equipe ele simplesmente desaparecia da tela, sem dizer se alguém tinha decidido,
 * quem foi, ou se o sistema tinha falhado. Uma decisão invisível parece defeito.
 *
 * ── DEZ SEGUNDOS, E POR QUE NÃO MENOS ─────────────────────────────────────────────────────────
 *
 * A leitura do cartão roda de 5 em 5 segundos. Uma janela de 5 s poderia cair inteira entre duas
 * leituras de uma aba e não ser vista por ninguém. Dez cobre duas leituras — quem estiver com a
 * tela aberta vê, mesmo sem estar olhando no instante do clique.
 *
 * ── VALE PARA OS DOIS, e o aceite é o caso mais fácil de errar ────────────────────────────────
 *
 * No aceite, a resposta do portal chega em 3 s na mediana (medido em 396 ordens). Sem esta janela, o
 * cartão sairia ANTES de alguém conseguir ler quem aceitou — justamente o aviso que mais importa,
 * porque aceitar não tem volta.
 *
 * ── O QUE NÃO MUDA: quem tira o cartão da tela continua sendo o SERVIDOR ──────────────────────
 *
 * A tela não ganhou um caminho de código que remova cartão por decisão. A oferta continua saindo
 * porque a leitura seguinte não a traz — só que agora o servidor espera dez segundos antes de parar
 * de trazê-la. O FR-014 segue provado por construção; mudou o QUANDO, não o QUEM.
 */
export const JANELA_DA_DECISAO_MS = 10_000;

/** O que aconteceu com a oferta, enquanto a janela dos dez segundos está aberta. */
export interface DecisaoDaOferta {
  tipo: "aceito" | "ignorado";
  /** Quem decidiu. Nulo quando a aceitação veio de fora do TMS e não há a quem creditar. */
  porNome: string | null;
  /** Só no ignorar, e opcional — quem ignora não é obrigado a explicar. */
  motivo: string | null;
}

/**
 * A decisão ainda está dentro da janela?
 *
 * `quando` nulo significa "não sabemos a hora" — é o caso da viagem aceita DIRETO NO PORTAL, que o
 * TMS descobre na leitura seguinte do plano e para a qual não há instante de clique. Aí a oferta sai
 * na hora, como sempre saiu: não há aviso a dar, porque não há quem creditar nem quando.
 */
export function decisaoAindaVisivel(quando: Date | null, agora: Date): boolean {
  return quando !== null && agora.getTime() - quando.getTime() < JANELA_DA_DECISAO_MS;
}
