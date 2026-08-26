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

  const valores = posicoes.map(
    (p) =>
      sql`(${p.placa}, ${p.latitude}, ${p.longitude}, ${p.cidade}, ${p.uf},
           ${p.cpfMotorista}, ${p.ignicao}, ${p.referencia}, ${p.posicaoEm}, now())`,
  );

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
  }>(sql`
    select
      p.placa, p.latitude, p.longitude, p.cidade, p.uf, p.ignicao, p.referencia,
      p.posicao_em,
      case when p.posicao_em is null then null
           else floor(extract(epoch from (now() - p.posicao_em)) / 60)::int end as minutos,
      d.name as motorista,
      p.cpf_motorista
    from logae_positions p
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
  }));
}
