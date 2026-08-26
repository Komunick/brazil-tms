/**
 * O STATUS DA PROGRAMAÇÃO — a coluna que a planilha tem (2026-08-26, a pedido).
 *
 * A "PROGRAMAÇÃO 2026" mantém uma coluna STATUS com dez valores coloridos, escolhidos à mão:
 * A ENVIAR, ENVIADO, PROG OK, CANCELADA, INFRUTÍFERA, NO SHOW, FINALIZADA, CIENTE, EM ROTA,
 * RETIDO PF.
 *
 * ── SÓ QUATRO, POR DECISÃO ────────────────────────────────────────────────────────────────────
 *
 * Ficam os quatro que descrevem o TRABALHO DA OPERAÇÃO sobre a viagem — coisa que só uma pessoa
 * sabe. Os outros seis o TMS já sabe sozinho: cancelada, finalizada e em rota saem do status da
 * viagem, que vem do portal e não depende de ninguém lembrar de marcar.
 *
 * Trazer os dez recriaria, em toda linha, a pergunta "qual dos dois vale?" — e a resposta seria
 * "depende de alguém ter atualizado à mão", que é justamente o que a planilha fazia mal.
 *
 * ── POR QUE AQUI, E NÃO NO PACOTE DO BANCO ────────────────────────────────────────────────────
 *
 * Porque a TELA precisa da lista para desenhar os botões, e a tela é código de navegador. Importar
 * um valor de `@brazil-tms/db` arrastaria o cliente de Postgres para dentro do bundle — o pacote do
 * banco só é importado TYPE-ONLY do lado do navegador, e tipo some no build.
 *
 * Aqui os dois lados leem a mesma lista, e o CHECK do banco (`trip_programacao_status_ck`) a repete
 * em SQL — três declarações da mesma regra, que é o preço de o banco também precisar saber.
 */
export const STATUS_DA_PROGRAMACAO = ["A_ENVIAR", "ENVIADO", "PROG_OK", "NO_SHOW"] as const;

export type StatusDaProgramacao = (typeof STATUS_DA_PROGRAMACAO)[number];

/**
 * O RÓTULO E A COR DE CADA UM, copiados da planilha.
 *
 * As cores importam mais do que parecem: quem trabalha nessa planilha há meses reconhece o verde
 * escuro como "enviado" antes de ler a palavra. Trocá-las por uma paleta nossa "mais bonita"
 * custaria essa leitura, e não devolveria nada.
 *
 * As classes são do Tailwind e ficam aqui, ao lado do valor, de propósito: separar o significado da
 * sua cor faria as duas listas divergirem no primeiro status novo.
 */
export const APARENCIA_DO_STATUS: Record<StatusDaProgramacao, { rotulo: string; classe: string }> =
  {
    A_ENVIAR: {
      rotulo: "A enviar",
      classe: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
    },
    ENVIADO: {
      rotulo: "Enviado",
      classe: "bg-emerald-700 text-white dark:bg-emerald-600",
    },
    PROG_OK: {
      rotulo: "Prog OK",
      classe: "bg-emerald-400 text-emerald-950 dark:bg-emerald-500 dark:text-emerald-950",
    },
    NO_SHOW: {
      rotulo: "No show",
      // Contorno em vez de preenchimento: na planilha o NO SHOW é o único claro, e essa diferença é
      // o que faz o olho parar nele numa coluna cheia de verdes.
      classe: "border border-rose-400 bg-transparent text-rose-600 dark:text-rose-400",
    },
  };
