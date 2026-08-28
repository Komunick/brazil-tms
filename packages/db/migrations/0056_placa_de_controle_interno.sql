/*
 * A PLACA QUE FICA SÓ NO TMS (2026-08-28, a pedido, depois de o usuário reproduzir o erro).
 *
 * ── O DEFEITO ─────────────────────────────────────────────────────────────────────────────────
 *
 * O portal conta as placas contra o tipo que a LH pede e recusa quando não fecha, com
 * `retcode 131213004: Quantidade incorreta do número do veículo`. Medido em 30 dias de ordens
 * reais:
 *
 *   carreta + 2 placas   97 concluídas        truck  + 2 placas   6 FALHAS
 *   truck   + 1 placa    24 concluídas        carreta + 1 placa   1 FALHA
 *   toco    + 1 placa    13 concluídas
 *   3/4     + 1 placa     7 concluídas
 *
 * Sete das nove falhas do período são exatamente isso. A recusa vem DEPOIS de a ordem ser
 * enfileirada e executada pelo robô — quem atribuiu já saiu da tela, e a falha aparece minutos
 * depois sem ninguém para ligar uma coisa à outra.
 *
 * ── E POR QUE A RESPOSTA NÃO É BLOQUEAR ───────────────────────────────────────────────────────
 *
 * Foi a primeira correção que tentei, e ela estava errada: a operação PRECISA registrar a carreta
 * que seguiu junto de um truck. Bloquear teria tirado uma coisa legítima para evitar um erro do
 * fornecedor — trocar uma recusa do portal por uma recusa nossa, que é pior porque ninguém
 * consegue contestá-la olhando a tela.
 *
 * A regra certa, dita pelo usuário: a PRIMEIRA placa é a que vai ao portal; a segunda, quando a LH
 * não a comporta, fica como controle interno.
 *
 * ── POR QUE COLUNA NOVA, E NÃO UMA LISTA SÓ ───────────────────────────────────────────────────
 *
 * `plates` é o que o robô ENVIA — é essa a definição dela desde que nasceu, e o robô lê essa coluna
 * direto. Guardar as duas coisas ali obrigaria o robô a saber cortar, e o robô é userscript: muda
 * por reinstalação manual, numa VM, com versão a subir na mão. Uma coluna a mais no servidor custa
 * uma migração; a mesma regra no robô custaria uma ida ao VNC a cada ajuste.
 *
 * Separadas, cada coluna responde uma pergunta e nenhuma das duas mente: `plates` é o que o portal
 * recebeu, `plates_internas` é o que a operação anotou.
 *
 * NULA na imensa maioria das linhas — só a LH que levou placa a mais tem valor aqui. É por isso que
 * não há índice: ninguém procura POR ela, só a lê junto da ordem que já foi encontrada.
 */
ALTER TABLE "portal_commands"
  ADD COLUMN IF NOT EXISTS "plates_internas" text;
