-- Onde o caminhão está agora, segundo o rastreador (eTorre / Raster).
--
-- UMA LINHA POR PLACA, sobrescrita a cada leitura. A trilha seria ~28 mil linhas por dia (98
-- veículos a cada cinco minutos) para responder "por onde ele passou?", que o próprio rastreador
-- responde melhor. O que falta no TMS é o AGORA, ao lado da viagem.
CREATE TABLE IF NOT EXISTS fleet_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate text NOT NULL,
  -- Opcional de propósito: um caminhão que o rastreador vê e o TMS não cadastrou é exatamente o que
  -- se quer enxergar. Recusar a linha esconderia o problema em vez de mostrá-lo.
  vehicle_id uuid REFERENCES vehicles (id),
  trailer_plate text,
  driver_label text,
  latitude double precision,
  longitude double precision,
  position_label text,
  position_at timestamptz,
  ignition text,
  trip_status text,
  origin_city text,
  destination_city text,
  trip_started_at timestamptz,
  -- A previsão de chegada calculada pela estrada, não pelo relógio. É o campo que justifica a
  -- integração: cruzada com a janela que o cliente publica, ela responde "vai chegar a tempo?".
  eta_at timestamptz,
  progress_percent double precision,
  km_travelled double precision,
  stopped_minutes integer,
  off_route text,
  no_position text,
  stopped_flag text,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- A gravação é upsert por placa. Sem esta chave, cada ciclo do robô acrescentaria 98 linhas e a
-- tabela viraria o histórico que ela não quer ser.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_positions_plate_uq ON fleet_positions (plate);

-- O join com a viagem passa pelo veículo atribuído.
CREATE INDEX IF NOT EXISTS fleet_positions_vehicle_idx ON fleet_positions (vehicle_id);

-- "O robô ainda está vivo?" é uma pergunta sobre a leitura mais recente.
CREATE INDEX IF NOT EXISTS fleet_positions_received_idx ON fleet_positions (received_at DESC);
