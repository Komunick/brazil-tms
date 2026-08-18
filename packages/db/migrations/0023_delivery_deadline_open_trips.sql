-- Prazo de entrega para as viagens ABERTAS que não tinham nenhum.
--
-- O alerta de atraso na entrega (`delayed_destination_arrival`) só dispara com
-- `planned_delivery_window_end` preenchido, e o portal do cliente não informa "partida" do último
-- ponto — 860 das 871 viagens do tmsdev estavam com esse campo nulo, ou seja, atraso de entrega não
-- alertava para ninguém. O import passou a preencher o fim da janela com a chegada prevista (a
-- promessa do cliente é um instante; a tolerância da regra de SLA é que dá a folga).
--
-- Aqui o mesmo, para o que já está no banco — **somente viagens abertas** (decisão do usuário em
-- 2026-08-16): uma viagem encerrada não vai atrasar mais, e ligar o prazo nela só produziria alerta
-- retroativo sobre história que ninguém pode mudar. Medido no tmsdev antes de escrever: 550 viagens
-- abertas sem prazo, das quais 61 com chegada prevista já vencida (alertam na primeira varredura) e
-- 489 no futuro (só alertam se atrasarem de fato).
--
-- `at_destination` está na lista por ser um status aberto, mas o alerta exige que a viagem ainda não
-- tenha chegado — então essas 240 não geram alerta nenhum; ganham o prazo para o relatório de SLA.
UPDATE "trips"
SET "planned_delivery_window_end" = "planned_delivery_window_start",
    "updated_at" = now()
WHERE "planned_delivery_window_end" IS NULL
  AND "planned_delivery_window_start" IS NOT NULL
  AND "current_status" IN (
    'received', 'assigned', 'confirmed', 'at_origin', 'loading',
    'loaded', 'in_transit', 'at_destination', 'unloading', 'unloaded'
  );
