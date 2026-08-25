/*
 * O ESTADO "NÃO TENTADA" — a Pré-SM que estava pronta e não foi pedida (2026-08-25, fatia 026).
 *
 * ── O DEFEITO QUE ISTO CONSERTA ───────────────────────────────────────────────────────────────
 *
 * Com a integração desligada (ou o teto diário atingido), a linha ficava `pendente`. E `pendente`
 * conta como VIVA no índice único parcial `trip_pre_sm_viva_uk`. Duas consequências que ninguém
 * queria:
 *
 *   1. Nada volta para buscar linha `pendente`. Ligar o interruptor não as converte — não existe
 *      quem as drene. Elas ficariam "esperando" para sempre.
 *   2. Elas BLOQUEIAM a viagem: uma nova atribuição colide no índice e o trabalho registra
 *      "já existia", sem criar nada.
 *
 * O efeito prático seria no primeiro teste real: escolher uma viagem já atribuída durante o dia de
 * observação faria o sistema não fazer NADA, e pareceria que a integração está quebrada.
 *
 * ── POR QUE UM ESTADO NOVO, E NÃO DRENAR AS PENDENTES ─────────────────────────────────────────
 *
 * Drenar seria pior: ligar o interruptor dispararia de uma vez todas as Pré-SM acumuladas do
 * período desligado — todas cobradas, todas de uma vez, sem ninguém olhando. O teto diário existe
 * justamente para que a primeira criação seja um ato deliberado.
 *
 * `nao_tentada` fica FORA do índice parcial, então a viagem volta a poder tentar na atribuição
 * seguinte. E continua guardando `payload_enviado` — o que TERIA sido mandado —, que é o valor
 * inteiro do dia de observação.
 *
 * Não é `sem_dados`: aquele significa "falta coisa nossa, alguém precisa agir". Este significa "não
 * falta nada, a integração é que não estava ligada". Mandam a pessoa a lugares diferentes.
 */
ALTER TYPE "public"."pre_sm_status" ADD VALUE IF NOT EXISTS 'nao_tentada';
