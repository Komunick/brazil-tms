import type { VehicleType } from "../schemas/master-data";

/**
 * ATRIBUIR MOTORISTA E PLACA NO PORTAL, a partir do TMS (2026-08-21).
 *
 * A segunda metade do fluxo que começou no aceite: aceitou, agora escala. No portal isso é uma tela
 * que abre logo depois do aceite (ou depois, pela ação "Atribuir/editar"); aqui é a aba "Atribuir".
 *
 * ── TUDO AQUI FOI MEDIDO NO FIO, NÃO LIDO NO CÓDIGO ────────────────────────────────────────────
 *
 * A lição do aceite: o bundle do portal tinha o caminho `/api/admin/transportation/...` escrito em
 * texto, e o que ele chama de verdade é `/api/line_haul/...`. Depois disso, nada nesta integração
 * entra por leitura de código — só por captura de requisição real.
 *
 * Foram três capturas, todas com `retcode: 0`:
 *
 *   1 motorista   POST /api/line_haul/agency/trip/assign
 *                 {trip_id, driver_id, vehicle_plate_number_list[], operation_info, agency_current_station_id}
 *
 *   2 motoristas  POST /api/line_haul/agency/trip/accept/assign_multiple_driver
 *                 {trip_id, driver_id, driver_pool[], vehicle_plate_number_list[], agency_current_station_id}
 *
 * São DUAS chamadas diferentes, não a mesma com um campo a mais: a de um motorista leva
 * `operation_info` e não leva `driver_pool`; a de dois faz o contrário. Construir só com o que o
 * código sugeria teria mandado tudo por um caminho só, e metade falharia.
 */

/** Uma placa única, normalizada como o portal a escreve: maiúscula, sem separador. */
export function normalizarPlaca(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * QUANTAS PLACAS ESTA VIAGEM PEDE.
 *
 * Medido no portal em 85 viagens já atribuídas, sem uma exceção: CARRETA e CARRETA - EXPRESSA levam
 * DUAS (cavalo e reboque); TRUCK, TOCO, 3/4 e VUC levam UMA.
 *
 * O portal tem o número exato em `required_number_of_vehicle_plate_number`, mas só no DETALHE de
 * cada viagem — uma chamada a mais por LH para saber algo que o tipo do veículo já diz. O tipo vem
 * na listagem que o robô lê a cada ciclo, e o TMS o guarda para todas as viagens.
 *
 * É uma regra NOSSA sobre um dado deles, então ela pode envelhecer. Por isso a tela deixa
 * acrescentar ou tirar uma placa: o padrão acerta, e quando não acertar quem está olhando conserta —
 * em vez de ficar preso a um campo que não bate com a viagem na frente dele.
 */
const DOIS_CONJUNTOS: ReadonlySet<string> = new Set([
  "carreta",
  "carreta_ls",
  "bitrem",
  "rodotrem",
]);

export function placasEsperadas(tipo: VehicleType | null | undefined): 1 | 2 {
  return tipo && DOIS_CONJUNTOS.has(tipo) ? 2 : 1;
}

/** O que a tela junta para mandar ao portal. */
export interface AtribuicaoNoPortal {
  /** O id do motorista NO PORTAL — não o do TMS. É a única chave que os dois lados compartilham. */
  driverId: number;
  /** O segundo motorista, quando existe. Vai em `driver_pool` e muda a rota da chamada. */
  secondDriverId?: number | null;
  /** Uma ou duas placas, já normalizadas. */
  plates: string[];
}

export type ImpedimentoDaAtribuicao =
  | "sem_motorista"
  | "sem_placa"
  | "placa_invalida"
  | "placas_repetidas"
  | "motoristas_repetidos";

/**
 * Por que esta atribuição NÃO pode ser enviada — ou `null` quando pode.
 *
 * Recusa aqui o que o portal recusaria depois. A diferença é o momento: aqui a pessoa ainda está na
 * tela, com o formulário aberto e o contexto na cabeça; lá ela recebe "falhou" minutos depois, por
 * um robô, sem saber qual campo.
 *
 * O que NÃO se valida aqui: se a placa existe no cadastro do portal. Só ele sabe, e chutar produziria
 * uma recusa nossa contra um caminhão que existe. Essa vem dele, com a mensagem dele.
 */
export function impedimentoDaAtribuicao(v: AtribuicaoNoPortal): ImpedimentoDaAtribuicao | null {
  if (!v.driverId) return "sem_motorista";
  if (v.secondDriverId && v.secondDriverId === v.driverId) return "motoristas_repetidos";

  const placas = v.plates.map(normalizarPlaca).filter((p) => p !== "");
  if (placas.length === 0) return "sem_placa";
  // Placa brasileira, nos dois formatos que convivem: ABC1234 e o Mercosul ABC1D23.
  if (placas.some((p) => !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p))) return "placa_invalida";
  if (new Set(placas).size !== placas.length) return "placas_repetidas";
  return null;
}

/**
 * QUAL DAS DUAS ROTAS DO PORTAL esta atribuição usa.
 *
 * Não é escolha de estilo: com dois motoristas, a rota de um motorista ignora o segundo em silêncio —
 * o pior desfecho possível, porque o portal responde sucesso e a viagem sai com metade do que foi
 * pedido.
 */
export function rotaDaAtribuicao(
  v: Pick<AtribuicaoNoPortal, "secondDriverId">,
): "assign" | "multi" {
  return v.secondDriverId ? "multi" : "assign";
}
