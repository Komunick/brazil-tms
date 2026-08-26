import { sql } from "drizzle-orm";
import { db } from "../client";
import type { StatusDaProgramacao } from "@brazil-tms/shared";

/**
 * AS MARCAS DA PROGRAMAÇÃO — só o que muda de minuto a minuto (2026-08-26, a pedido).
 *
 * ── O PROBLEMA ────────────────────────────────────────────────────────────────────────────────
 *
 * O quadro recarrega de 60 em 60 segundos, e é o certo para o que ele mostra: origem, destino,
 * janela de coleta, motorista e telefone vêm do portal e mudam a cada poucos minutos, na melhor das
 * hipóteses.
 *
 * Mas DUAS coisas na linha mudam por gesto humano, agora: o status e a contagem de comentários. Uma
 * pessoa marca "Enviado" e a colega do lado só vê daqui a um minuto — o que, num quadro que duas
 * pessoas trabalham juntas, faz as duas marcarem a mesma viagem.
 *
 * ── POR QUE UMA CONSULTA SEPARADA, E NÃO SÓ ACELERAR O QUADRO ─────────────────────────────────
 *
 * Porque o quadro é caro: cada linha traz vinte campos, e algumas centenas de linhas com nome,
 * telefone e CPF são dezenas de quilobytes. Puxar isso de dez em dez segundos, por pessoa, o dia
 * inteiro, é desperdício para atualizar dois campos.
 *
 * Esta consulta devolve TRÊS colunas por viagem marcada. É uma fração do tamanho, e por isso pode
 * rodar num passo muito mais curto.
 *
 * ── NÃO REPETE O RECORTE DA TELA, E ISSO É DELIBERADO ─────────────────────────────────────────
 *
 * A tentação era filtrar pela mesma janela de dias e pelas mesmas frentes que o quadro usa — e aí
 * seriam duas cópias da mesma regra, que divergem no primeiro ajuste.
 *
 * Em vez disso devolve um SUPERCONJUNTO: toda viagem marcada cuja coleta é de 30 dias atrás em
 * diante. O teto de 30 dias é o mesmo que a rota do quadro já impõe (`diasAtras.max(30)`), então
 * nenhuma linha visível fica de fora. A tela usa o que casa com as linhas que tem e ignora o resto.
 *
 * ── E A AUSÊNCIA TAMBÉM É INFORMAÇÃO ──────────────────────────────────────────────────────────
 *
 * Quem tira um status some desta lista. A tela precisa tratar isso como "limpar", e não como "não
 * sei" — senão o status removido por uma pessoa continuaria na tela das outras até a recarga do
 * quadro. É por isso que a lista é COMPLETA dentro da janela, e não um diff.
 */

export interface MarcaDaProgramacao {
  tripId: string;
  status: StatusDaProgramacao | null;
  comentarios: number;
}

export async function marcasDaProgramacao(): Promise<MarcaDaProgramacao[]> {
  const linhas = await db.execute<{
    trip_id: string;
    status: string | null;
    comentarios: number;
  }>(sql`
    with marcadas as (
      -- As duas fontes de marca, unidas: uma viagem pode ter status, comentário, ou os dois.
      select trip_id from trip_programacao where status is not null
      union
      select trip_id from trip_comments where apagado_em is null
    )
    select
      m.trip_id,
      p.status,
      (select count(*)::int from trip_comments tc
        where tc.trip_id = m.trip_id and tc.apagado_em is null) as comentarios
    from marcadas m
    join trips t on t.id = m.trip_id
    left join trip_programacao p on p.trip_id = m.trip_id
    -- Superconjunto de qualquer janela que a tela consiga pedir: a rota do quadro limita
    -- \`diasAtras\` a 30. Sem este corte, a lista cresceria para sempre com viagens de meses atrás
    -- que ninguém mais vê.
    where t.planned_pickup_window_start is not null
      and (t.planned_pickup_window_start at time zone 'America/Sao_Paulo')::date
            >= (now() at time zone 'America/Sao_Paulo')::date - 30
  `);

  return linhas.map((r) => ({
    tripId: r.trip_id,
    status: (r.status as StatusDaProgramacao | null) ?? null,
    comentarios: Number(r.comentarios ?? 0),
  }));
}
