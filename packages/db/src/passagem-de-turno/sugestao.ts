import { sql } from "drizzle-orm";
import { type Sugestao, perfilDoTipoDeVeiculo, rotaEscrita } from "@brazil-tms/shared";
import { db } from "../client";

/**
 * O QUE O TMS SABE SOBRE UMA LH — para preencher o item da passagem de turno (2026-08-27, a pedido).
 *
 * Na planilha, quem registra uma ocorrência copia seis campos do portal, um por um, com o telefone
 * no ombro. Aqui a LH basta: origem, destino, ETA da coleta, motorista, placa e rota saem do banco.
 *
 * ── DUAS FONTES, NESTA ORDEM ──────────────────────────────────────────────────────────────────
 *
 * Primeiro `trips`, que é a viagem de verdade. Se não achar, `spot_offers` — porque uma boa parte
 * das LHs que o setor SPOT registra são ofertas que NUNCA viraram viagem: a seção
 * "spot perdido / aceito por outra 3PL" é exatamente sobre elas. Procurar só em `trips` deixaria
 * mudo justamente o setor que mais digita.
 *
 * ── NADA AQUI ESCREVE ─────────────────────────────────────────────────────────────────────────
 *
 * É leitura pura, e o resultado é uma SUGESTÃO: quem decide o que entra no item é
 * `aplicarSugestao`, que só preenche campo vazio. O banco não sabe o que a pessoa já digitou, e não
 * deve saber.
 */

/** A LH escrita de qualquer jeito vira a forma que o portal usa: maiúscula, sem espaço em volta. */
function normalizarLH(lh: string): string {
  return lh.trim().toUpperCase();
}

/**
 * A busca pela LH. `null` quando não achou em lugar nenhum.
 *
 * `null` e não um objeto vazio, de propósito: a tela precisa distinguir "achei e não havia nada a
 * preencher" de "essa LH não existe". A segunda quase sempre é erro de digitação, e dizer isso na
 * hora poupa uma ocorrência registrada na viagem errada.
 */
export async function sugestaoPelaLH(lh: string): Promise<Sugestao | null> {
  const chave = normalizarLH(lh);
  if (chave === "") return null;

  return (await daViagem(chave)) ?? (await daOfertaDeSpot(chave));
}

/**
 * A viagem, com a atribuição mais recente.
 *
 * A subconsulta de atribuição é a mesma da fila da GR (`gr-fila.ts`) — mesma pergunta, mesma
 * resposta. Duas formas diferentes de achar "quem está escalado" divergiriam no dia em que uma
 * fosse corrigida e a outra não, e a divergência apareceria como "a aba GR diz um motorista e a
 * passagem de turno diz outro", que ninguém liga a código duplicado.
 */
async function daViagem(lh: string): Promise<Sugestao | null> {
  const linhas = await db.execute<{
    origem: string | null;
    destino: string | null;
    eta_origem: string | null;
    motorista: string | null;
    placa: string | null;
    tipo_veiculo: string | null;
  }>(sql`
    with atribuicao as (
      select distinct on (pc.trip_id) pc.trip_id, pc.driver_id, pc.plates
        from portal_commands pc
       where pc.action = 'assign' and pc.status = 'done'
       order by pc.trip_id, pc.settled_at desc nulls last
    )
    select
      o.name as origem,
      d.name as destino,
      /*
       * A ETA sai FORMATADA EM SÃO PAULO, e não como instante.
       *
       * O campo do item é texto — a planilha aceita "16:30", "25/08/2026 21:30:00" e
       * "25/08/2026 20h30" na mesma coluna. Mandar o instante cru faria a tela formatar, e a tela
       * roda no relógio de quem abriu: um navegador em UTC mostraria três horas a menos numa
       * anotação que vai ser lida por outra pessoa, noutro turno.
       */
      to_char(t.planned_pickup_window_start at time zone 'America/Sao_Paulo',
              'DD/MM/YYYY HH24:MI')            as eta_origem,
      m.name                                   as motorista,
      a.plates                                 as placa,
      veic.tipo                                as tipo_veiculo
      from trips t
      join locations o on o.id = t.origin_location_id
      join locations d on d.id = t.destination_location_id
      left join atribuicao a on a.trip_id = t.id
      left join drivers m on m.portal_driver_id = a.driver_id::text
      /*
       * O TIPO vem da PRIMEIRA placa, que é o cavalo. As demais são carretas, e o perfil da
       * operação ("CARRETA" ou "TRUCK") é do conjunto, não do reboque.
       */
      left join lateral (
        select vv.vehicle_type::text as tipo
          from vehicles vv
         where vv.plate = split_part(replace(coalesce(a.plates, ''), ' ', ''), ',', 1)
         limit 1
      ) veic on true
     where upper(t.external_trip_id) = ${lh}
     order by t.updated_at desc
     limit 1
  `);

  const r = linhas[0];
  if (!r) return null;

  return semVazios({
    origem: r.origem ?? undefined,
    destino: r.destino ?? undefined,
    eta_origem: r.eta_origem ?? undefined,
    motorista: r.motorista ?? undefined,
    placa: r.placa ?? undefined,
    rota: rotaEscrita(r.origem, r.destino),
    perfil: perfilDoTipoDeVeiculo(r.tipo_veiculo) ?? undefined,
    fonte: "viagem",
  });
}

/**
 * A oferta de spot — a LH que nunca virou viagem.
 *
 * Procura nas DUAS chaves (`portal_trip_id` e `trip_number`) porque não se sabe qual delas é a que
 * a pessoa tem à mão: o monitor grava as duas, e quem registra a ocorrência copia o que estiver na
 * tela do portal naquele momento.
 */
async function daOfertaDeSpot(lh: string): Promise<Sugestao | null> {
  const linhas = await db.execute<{
    route: string | null;
    origin_arrival: string | null;
    created_at_portal: string | null;
    vehicle: string | null;
  }>(sql`
    select route, origin_arrival, created_at_portal, vehicle
      from spot_offers
     where upper(portal_trip_id) = ${lh} or upper(coalesce(trip_number, '')) = ${lh}
     order by received_at desc
     limit 1
  `);

  const r = linhas[0];
  if (!r) return null;

  /*
   * O monitor monta a rota como "ORIGEM  ->  DESTINO" (ver o comentário da tabela). Partir por
   * `->` devolve as duas pontas; se o formato mudar, `pontas` volta vazio e só a rota inteira é
   * sugerida — que continua útil, em vez de sugerir metade errada.
   */
  const pontas = (r.route ?? "").split("->").map((p) => p.trim());
  const origem = pontas.length === 2 ? pontas[0] : undefined;
  const destino = pontas.length === 2 ? pontas[1] : undefined;

  return semVazios({
    origem,
    destino,
    rota: (r.route ?? "").trim() || undefined,
    eta_origem: r.origin_arrival ?? undefined,
    data_criacao: r.created_at_portal ?? undefined,
    placa: r.vehicle ?? undefined,
    fonte: "spot",
  });
}

/**
 * O TELEFONE a partir do nome do motorista — para a seção "motorista disponível".
 *
 * ── SÓ QUANDO O NOME CASA COM UM SÓ ───────────────────────────────────────────────────────────
 *
 * Casar nome é frágil, e este cadastro tem 1.449 motoristas. Se dois batem, não sugere nada: um
 * telefone errado numa lista de "quem está disponível" faz alguém ligar para a pessoa errada às
 * três da manhã, e o engano só aparece na ligação.
 *
 * A comparação ignora acento, caixa e espaço repetido, que são as três formas de a mesma pessoa
 * ser escrita diferente. Não vai além disso de propósito — busca aproximada aqui traria o
 * homônimo, que é justamente o caso perigoso.
 */
export async function sugestaoPeloMotorista(nome: string): Promise<Sugestao | null> {
  const alvo = dobrarAcento(nome);
  // Nome curto demais casaria com meio cadastro. Três letras é o piso do que é um nome.
  if (alvo.length < 3) return null;

  /*
   * ── A COMPARAÇÃO É EM JAVASCRIPT, E NÃO NO POSTGRES ─────────────────────────────────────────
   *
   * O jeito natural seria `unaccent(lower(name)) = unaccent(lower($1))`. **`unaccent` não está
   * instalada neste banco** — nenhuma migração roda `CREATE EXTENSION`, e nada no repositório a
   * usa. A consulta falharia com `function unaccent(text) does not exist`, em produção, no primeiro
   * uso: exatamente a classe de defeito que derrubou a aba da Programação em 26/08.
   *
   * ── E POR QUE TRAZER A LISTA INTEIRA NÃO É DESPERDÍCIO ──────────────────────────────────────
   *
   * O filtro `phone is not null` é o que torna isto barato: são os únicos que podem responder à
   * pergunta. Dos 1.449 motoristas do cadastro, só uma fração tem telefone — e a consulta roda uma
   * vez, quando alguém sai do campo do nome, não a cada tecla.
   *
   * A alternativa (filtrar por prefixo no SQL) esbarraria no mesmo acento: `like 'CONCEI%'` não
   * acha `CONCEIÇÃO`.
   */
  const linhas = await db.execute<{ name: string; phone: string | null }>(sql`
    select name, phone
      from drivers
     where archived_at is null
       and nullif(btrim(coalesce(phone, '')), '') is not null
  `);

  const casaram = linhas.filter((d) => dobrarAcento(d.name) === alvo);

  // Dois casamentos = homônimo. Nenhuma sugestão é melhor que a sugestão de um dos dois — um
  // telefone errado numa lista de disponíveis faz alguém ligar para a pessoa errada de madrugada.
  if (casaram.length !== 1) return null;
  const telefone = casaram[0]?.phone?.trim();
  if (!telefone) return null;

  return { telefone, fonte: "motorista" };
}

/**
 * Caixa, acento e espaço repetido fora — as três formas de a MESMA pessoa ser escrita diferente.
 *
 * Não vai além disso de propósito: busca aproximada aqui traria o homônimo, que é justamente o caso
 * que precisa ser recusado.
 */
export function dobrarAcento(texto: string): string {
  return (
    texto
      .normalize("NFD")
      // A faixa vai ESCAPADA (`\u0300-\u036f`) e não com os caracteres literais: são marcas
      // combinantes invisíveis no código, e um editor que "arrume" o arquivo as apaga sem deixar
      // rastro — o regex viraria `/[-]/` e pararia de dobrar acento, calado.
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
  );
}

/** Tira as chaves vazias — a sugestão só carrega o que realmente achou. */
function semVazios(s: Sugestao): Sugestao {
  const saida: Record<string, string> = {};
  for (const [k, v] of Object.entries(s)) {
    if (typeof v === "string" && v.trim() !== "") saida[k] = v.trim();
  }
  return saida as Sugestao;
}
