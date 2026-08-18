-- Carimba a confirmação nas atribuições cuja viagem já passou dela (2026-08-16).
--
-- O aviso "confirmação pendente" olha o carimbo na atribuição, não o status da viagem. E o carimbo
-- só nascia quando alguém clicava "Confirmar" no TMS — cerimônia que o caminho do portal atravessa
-- sem parar. Resultado: avisos acesos em viagens CARREGANDO, sem jeito de apagar, porque a
-- confirmação que faltava já tinha acontecido no mundo.
--
-- O código já não produz mais isso. Isto é o passivo: 58 atribuições que ficaram para trás, e que
-- nenhuma varredura de SLA consegue resolver sozinha, porque a entrada que ela lê continua nula.
--
-- O instante é a CHEGADA NA ORIGEM registrada pelo cliente — o momento em que a confirmação deixou
-- de ser pergunta. Sem esse evento, vale a hora em que a atribuição foi criada: aproximada, mas
-- nunca depois do fato. E o autor é quem fez a atribuição, não um usuário inventado para a ocasião.
--
-- Só toca a atribuição ATUAL de viagem em execução. Viagem parada em `assigned` fica como está: lá
-- a pergunta continua de pé, e é exatamente para isso que o aviso existe.

update trip_assignments a
set confirmed_at = coalesce(
      (select min(e.event_timestamp)
         from trip_events e
        where e.trip_id = a.trip_id
          and e.event_type = 'origin_arrived'
          and e.event_timestamp is not null),
      a.created_at
    ),
    confirmed_by_user_id = a.assigned_by_user_id,
    updated_at = now()
from trips t
where t.id = a.trip_id
  and a.is_current
  and a.confirmed_at is null
  and t.current_status in (
    'at_origin', 'loading', 'loaded', 'in_transit', 'at_destination', 'unloading', 'unloaded'
  );
