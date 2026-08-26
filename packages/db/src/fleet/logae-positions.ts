import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * AS POSIÇÕES DA GERENCIADORA — gravar o que o job trouxe, e ler para a tela (2026-08-26).
 *
 * O porquê de existirem ao lado de `fleet_positions` está em `schema/logae-positions.ts`. Em
 * resumo: aquelas vêm como TEXTO ("0.64 km de FILIAL COOPERCARGA…") e estas vêm com coordenada.
 */

export interface PosicaoParaGravar {
  placa: string;
  latitude: number | null;
  longitude: number | null;
  cidade: string | null;
  uf: string | null;
  cpfMotorista: string | null;
  ignicao: string | null;
  referencia: string | null;
  posicaoEm: Date | null;
}

/**
 * Grava o lote inteiro numa ida, sobrescrevendo o que havia por placa.
 *
 * ── UMA INSTRUÇÃO, E NÃO 91 ───────────────────────────────────────────────────────────────────
 *
 * São ~91 placas a cada carga, e o job roda de minuto em minuto. Um `insert` por linha seriam 91
 * idas ao banco por ciclo, mais de cem mil por dia, para gravar meia dúzia de quilobytes.
 *
 * ── SOBRESCREVE, NÃO ACUMULA ──────────────────────────────────────────────────────────────────
 *
 * A pergunta é "onde este caminhão está AGORA": a linha anterior da mesma placa não interessa mais
 * e sai. Quem quiser trajeto precisa de outra tabela, com outro tamanho e outro pedido.
 */
export async function gravarPosicoesDaGerenciadora(
  posicoes: readonly PosicaoParaGravar[],
): Promise<number> {
  if (posicoes.length === 0) return 0;

  const valores = posicoes.map(linhaDeValores);

  await db.execute(sql`
    insert into logae_positions
      (placa, latitude, longitude, cidade, uf, cpf_motorista, ignicao, referencia,
       posicao_em, carregado_em)
    values ${sql.join(valores, sql`, `)}
    on conflict (placa) do update set
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      cidade = excluded.cidade,
      uf = excluded.uf,
      cpf_motorista = excluded.cpf_motorista,
      ignicao = excluded.ignicao,
      referencia = excluded.referencia,
      posicao_em = excluded.posicao_em,
      carregado_em = now()
  `);
  return posicoes.length;
}

export interface VeiculoNoMapa {
  placa: string;
  latitude: number;
  longitude: number;
  cidade: string | null;
  uf: string | null;
  ignicao: string | null;
  referencia: string | null;
  posicaoEm: string | null;
  /** Quantos minutos desde a posição. É o que decide se ela ainda vale alguma coisa. */
  minutos: number | null;
  /** Do nosso cadastro, casado pelo CPF que a gerenciadora manda. `null` = não achamos. */
  motorista: string | null;
  cpfMotorista: string | null;
  /**
   * A LH em que este caminhão está agora, se houver.
   *
   * É o que a tela da gerenciadora chama de "Status Viagem", e é a informação que mais decide na
   * hora de escalar: um caminhão a 25 km EM VIAGEM não serve, e um a 39 km LIVRE serve. Sem isso, a
   * lista ordenada por distância manda a pessoa ligar para quem não pode atender.
   */
  emViagem: string | null;
}

/**
 * A frota com posição utilizável, da mais recente para a mais velha.
 *
 * ── SÓ QUEM TEM COORDENADA DE VERDADE ─────────────────────────────────────────────────────────
 *
 * `latitude`/`longitude` nulos ou ZERO ficam de fora. Zero-zero é uma coordenada válida no
 * Atlântico, ao largo da África — dois dos 91 vieram assim, e sem este filtro apareceriam no mapa
 * como caminhões no meio do oceano.
 *
 * ── O MOTORISTA SAI DO CPF, e é por isso que presta ───────────────────────────────────────────
 *
 * A gerenciadora manda o CPF no campo chamado `Motorista`. O `left join` pelo CPF resolve o nome no
 * NOSSO cadastro — casamento por chave, não por nome. Quando não acha, a linha continua vindo com o
 * CPF: um caminhão sem nome de motorista ainda diz onde está.
 */
export async function frotaComPosicao(idadeMaximaMinutos = 24 * 60): Promise<VeiculoNoMapa[]> {
  const linhas = await db.execute<{
    placa: string;
    latitude: number;
    longitude: number;
    cidade: string | null;
    uf: string | null;
    ignicao: string | null;
    referencia: string | null;
    posicao_em: Date | null;
    minutos: number | null;
    motorista: string | null;
    cpf_motorista: string | null;
    em_viagem: string | null;
  }>(sql`
    select
      p.placa, p.latitude, p.longitude, p.cidade, p.uf, p.ignicao, p.referencia,
      p.posicao_em,
      case when p.posicao_em is null then null
           else floor(extract(epoch from (now() - p.posicao_em)) / 60)::int end as minutos,
      d.name as motorista,
      p.cpf_motorista,
      v.external_trip_id as em_viagem
    from logae_positions p
    /**
     * A VIAGEM EM CURSO, casada pela PLACA que o portal escreve.
     *
     * ── A JANELA É DE "at_origin" A "unloaded" ─────────────────────────────────────────────
     *
     * "assigned" e "confirmed" ficam de FORA de propósito: o caminhão foi escalado e ainda não
     * saiu, então continua disponível para quem estiver montando o dia. Contá-los como ocupados
     * esconderia metade da frota logo depois da atribuição da manhã.
     *
     * Do "completed" em diante também sai — a viagem acabou.
     *
     * ── "distinct on" PORQUE UMA PLACA PODE APARECER EM DUAS ──────────────────────────────
     *
     * Reatribuição e correção deixam mais de uma LH viva com a mesma placa. Sem o corte, o join
     * duplicaria a linha do veículo e o mesmo caminhão apareceria duas vezes na lista. A mais
     * recente é a que vale.
     */
    left join lateral (
      select t.external_trip_id
        from trips t
       where t.current_status in ('at_origin','loading','loaded','in_transit',
                                  'at_destination','unloading','unloaded')
         and upper(regexp_replace(coalesce(t.customer_fields ->> 'Placa (portal)', ''),
                                  '[^A-Za-z0-9,]', '', 'g')) like '%' || p.placa || '%'
       order by t.updated_at desc
       limit 1
    ) v on true
    -- Por CPF, e só dígitos dos dois lados: o cadastro guarda com pontuação em parte das linhas.
    left join drivers d
      on regexp_replace(coalesce(d.cpf, ''), '[^0-9]', '', 'g')
       = regexp_replace(coalesce(p.cpf_motorista, ''), '[^0-9]', '', 'g')
      and coalesce(p.cpf_motorista, '') <> ''
      and d.archived_at is null
    where p.latitude is not null and p.longitude is not null
      and p.latitude <> 0 and p.longitude <> 0
      and (
        p.posicao_em is null
        or p.posicao_em > now() - make_interval(mins => ${idadeMaximaMinutos})
      )
    order by p.posicao_em desc nulls last
  `);

  return linhas.map((r) => ({
    placa: r.placa,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    cidade: r.cidade,
    uf: r.uf,
    ignicao: r.ignicao,
    referencia: r.referencia,
    posicaoEm: r.posicao_em ? new Date(r.posicao_em).toISOString() : null,
    minutos: r.minutos == null ? null : Number(r.minutos),
    motorista: r.motorista,
    cpfMotorista: r.cpf_motorista,
    emViagem: r.em_viagem,
  }));
}

/**
 * A DATA VAI EM ISO, e não como `Date`.
 *
 * Passar o objeto direto para o template do drizzle o serializa com `toString()`, e o que chega
 * ao Postgres é `Wed Aug 26 2026 17:23:02 GMT+0000 (Coordinated Universal Time)`. O sufixo entre
 * parênteses não é data para ninguém, e o INSERT INTEIRO falha — não a linha, a instrução toda.
 *
 * ── O MODO COMO ISSO FALHOU É O QUE VALE GUARDAR ──────────────────────────────────────────
 *
 * O job passou nos testes, porque eles usam mock do banco. A mesma consulta escrita à mão no psql
 * funcionou. Só a combinação drizzle + `Date` quebrava.
 *
 * E o erro do drizzle mostra a consulta e os parâmetros mas ESCONDE a mensagem do Postgres, que
 * fica em `.cause` — foi preciso ler os 819 parâmetros do log até achar a data torta.
 *
 * Pior: cascateou. O insert falhando fez o pg-boss reexecutar, as chamadas caíram dentro do
 * limite de dez segundos da Integra, e o log passou a gritar "CONSUMO INDEVIDO". O sintoma que
 * aparecia primeiro não era a causa.
 *
 * ── E O COMENTÁRIO FICA AQUI FORA, não dentro do `sql` ────────────────────────────────────
 *
 * Comentário dentro de template literal não é comentário — é TEXTO. E as crases dele encerram o
 * literal, com erro de sintaxe a três linhas de distância. Custou uma segunda ida.
 */
export function linhaDeValores(p: PosicaoParaGravar) {
  return sql`(${p.placa}, ${p.latitude}, ${p.longitude}, ${p.cidade}, ${p.uf},
           ${p.cpfMotorista}, ${p.ignicao}, ${p.referencia},
           ${p.posicaoEm ? p.posicaoEm.toISOString() : null}, now())`;
}
