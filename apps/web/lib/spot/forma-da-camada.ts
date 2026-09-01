/**
 * ONDE O CARTÃO DE SPOT SE PÕE, e por quê (2026-09-01, a pedido).
 *
 * ── O QUE DECIDE NÃO É A TELA: É O QUE ELA ESTÁ PEDINDO DE VOCÊ ───────────────────────────────
 *
 * O cartão vinha ocupando o meio da tela para todo mundo, em toda tela. Duas coisas estavam erradas
 * nisso ao mesmo tempo, e o usuário corrigiu as duas:
 *
 *   · o MEIO da tela é caro, e só vale para quem vai AGIR. Quem não decide precisa saber que a
 *     oferta chegou — e saber não exige o meio da tela;
 *   · quem está NO MEIO DE UM GESTO não pode ser interrompido, seja qual for a tela.
 *
 * Daí as três formas, em ordem de quanto pedem de atenção:
 *
 *   `centro`   — a esteira grande no meio. O único caso: o Painel do dia de quem pode decidir.
 *   `popup`    — no canto inferior direito. A oferta inteira, com os botões travados para quem não
 *                decide. É o que a equipe recebe, e o que toda tela que não é o Painel recebe.
 *   `pastilha` — só a contagem. Enquanto há um diálogo aberto, e por escolha de quem recolheu.
 *
 * ── O DIÁLOGO ABERTO É O SINAL, e não uma lista de telas ──────────────────────────────────────
 *
 * O pedido foi "na tela de atribuição o spot aparecer já recolhido". Atribuir não é uma tela: é um
 * diálogo (`portal-assign-dialog`), que abre de dentro da Expedição, da Torre e da lista de viagens.
 * Uma lista de rotas erraria nas três e envelheceria a cada tela nova.
 *
 * O diálogo ABERTO é o sinal certo, e é mais largo do que o pedido de propósito: editar uma viagem,
 * confirmar um cancelamento e escrever um motivo são todos "estou no meio de um gesto". O cartão
 * encolhe enquanto dura e volta sozinho quando fecha — sem apagar a escolha de quem já tinha
 * recolhido à mão.
 *
 * ── RECOLHER ENCOLHE UM PASSO; ABRIR VOLTA DE UMA VEZ ─────────────────────────────────────────
 *
 * `centro → popup → pastilha`, um clique por vez. Abrir devolve o padrão direto: quem recolheu duas
 * vezes não deve precisar de dois cliques para voltar a enxergar.
 */

export type FormaDaCamada = "centro" | "popup" | "pastilha";

/** Em ordem crescente de discrição — é ela que `aoRecolher` percorre. */
const ORDEM: readonly FormaDaCamada[] = ["centro", "popup", "pastilha"];

export interface SituacaoDaCamada {
  /**
   * A forma que esta tela dá a esta pessoa quando ninguém mexeu em nada.
   *
   * `centro` só para o Painel do dia de quem tem `decidir_spot` — e para o painel de parede, que
   * existe para ser visto de longe e não tem ninguém para pré-selecionar.
   */
  padrao: Exclude<FormaDaCamada, "pastilha">;
  /** O que a pessoa escolheu nesta sessão de tela. `null` enquanto ela não mexeu. */
  escolhida: FormaDaCamada | null;
  /** Há um diálogo aberto agora — alguém está no meio de um gesto. */
  dialogoAberto: boolean;
}

export function formaDaCamada({
  padrao,
  escolhida,
  dialogoAberto,
}: SituacaoDaCamada): FormaDaCamada {
  /*
    O GESTO EM ANDAMENTO GANHA DE TUDO, inclusive de quem tinha aberto o cartão de propósito. É o
    "não atrapalhe quem está atribuindo", e ele não é negociável por preferência: a escolha fica
    guardada e volta a valer no instante em que o diálogo fecha.
  */
  if (dialogoAberto) return "pastilha";

  const querida = escolhida ?? padrao;

  /*
    O CENTRO NÃO SE CONQUISTA ABRINDO. Quem não tem o centro por padrão não chega nele por caminho
    nenhum — sem esta linha, um `escolhida: "centro"` vindo de um estado antigo daria a quem não
    decide exatamente a tela que esta fatia veio tirar dele.
  */
  return querida === "centro" && padrao !== "centro" ? "popup" : querida;
}

/** Um passo mais discreto. Da pastilha não há para onde encolher. */
export function aoRecolher(atual: FormaDaCamada): FormaDaCamada {
  const i = ORDEM.indexOf(atual);
  return ORDEM[Math.min(i + 1, ORDEM.length - 1)]!;
}
