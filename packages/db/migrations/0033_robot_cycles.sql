-- Quanto tempo cada robô está levando por ciclo (2026-08-21).
--
-- A tela de Status respondia "o dado ainda chega?" pelo carimbo da última entrega — o que pega a
-- parada, mas só depois dela. Quando o navegador da VM sufoca, o sintoma vem antes: o ciclo
-- configurado para 10 segundos passa a levar 45. O dado continua chegando, só que velho, e a tela
-- diz "ok" enquanto a operação decide sobre um retrato de um minuto atrás.
--
-- Guarda o intervalo CONFIGURADO e a duração REAL do último ciclo, lado a lado. A comparação é o
-- aviso. Uma linha por robô, sobrescrita: a série seriam 26 mil linhas por dia a 10 segundos, para
-- responder uma pergunta que ninguém faz.
CREATE TABLE IF NOT EXISTS robot_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot text NOT NULL,
  interval_ms integer,
  duration_ms integer,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS robot_cycles_robot_uq ON robot_cycles (robot);
