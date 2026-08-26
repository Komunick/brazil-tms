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
 * A APARÊNCIA (rótulo e cor) NÃO MORA AQUI — está em `apps/web/lib/trips/aparencia-do-status.ts`.
 *
 * Ela nasceu neste arquivo e QUEBROU: o Tailwind varre só `./app`, `./components` e `./lib` de
 * `apps/web`, então classes escritas neste pacote não chegam ao CSS gerado. O selo "Enviado" saiu
 * branco sobre branco, e nada acusou — build, typecheck e teste passaram todos.
 *
 * A divisão vale a pena guardar: os VALORES ficam aqui, porque o banco e a API precisam deles; a
 * aparência fica no app, porque é do navegador e é lá que o Tailwind olha.
 */
