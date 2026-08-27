import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import {
  type Setor,
  type Turno,
  DEFINICAO_DO_TURNO,
  contadoresDo,
  problemasDoItem,
  setorValido,
} from "@brazil-tms/shared";
import {
  passagemDeTurno,
  passagemDeTurnoContador,
  passagemDeTurnoItem,
} from "../../schema/passagem-de-turno";
import { db } from "../client";

/**
 * A PASSAGEM DE TURNO — ler e escrever o bloco do dia (2026-08-26, a pedido).
 *
 * A forma de cada setor mora em `@brazil-tms/shared`; o porquê de cada coluna, na migração
 * `0054_passagem_de_turno.sql`. Aqui só o acesso.
 *
 * ── A TRAVA DO BLOCO FECHADO ESTÁ NO `WHERE`, E ISSO É DELIBERADO ─────────────────────────────
 *
 * Toda escrita carrega `and fechado_em is null` na própria condição, em vez de ler o bloco, checar
 * em JavaScript e então gravar. A diferença aparece exatamente no momento em que importa: a trava
 * automática fecha o bloco enquanto alguém está com o formulário aberto. Entre o `select` e o
 * `update` cabe o fechamento inteiro, e a checagem em memória deixaria passar uma edição depois da
 * entrega — que é o único defeito que este recurso não pode ter, porque a linha do tempo passaria
 * a mentir sem que nada acusasse.
 *
 * As funções devolvem `false` quando não gravaram. Quem chama transforma isso em "este turno já
 * foi entregue" na tela — nunca em erro de servidor, porque não é erro: é corrida perdida.
 */

export interface Bloco {
  id: string;
  data: string;
  turno: Turno;
  setor: Setor;
  assistente: string | null;
  supervisor: string | null;
  fechadoEm: Date | null;
  fechadoAutomaticamente: boolean;
}

export interface ItemDoBloco {
  id: string;
  secao: string;
  ordem: number;
  dados: Record<string, string>;
}

export interface BlocoCompleto extends Bloco {
  itens: ItemDoBloco[];
  /** O que alguém digitou, por chave de contador. */
  digitados: Record<string, string>;
  /** O que o TMS apurou sozinho. Só as chaves que ele sabe responder — ver `contadoresApurados`. */
  apurados: Record<string, number>;
}

/**
 * O bloco `(data, turno, setor)` — criado se ainda não existir.
 *
 * `on conflict do nothing` e não `do update`: dois operadores abrindo a mesma faixa no mesmo
 * segundo é o caso normal, não erro. O segundo simplesmente encontra o que o primeiro criou.
 */
export async function garantirBloco(data: string, turno: Turno, setor: Setor): Promise<string> {
  await db
    .insert(passagemDeTurno)
    .values({ data, turno, setor })
    .onConflictDoNothing({
      target: [passagemDeTurno.data, passagemDeTurno.turno, passagemDeTurno.setor],
    });

  const [linha] = await db
    .select({ id: passagemDeTurno.id })
    .from(passagemDeTurno)
    .where(
      and(
        eq(passagemDeTurno.data, data),
        eq(passagemDeTurno.turno, turno),
        eq(passagemDeTurno.setor, setor),
      ),
    )
    .limit(1);

  // O `select` depois do `insert` não pode voltar vazio: ou inserimos, ou o outro inseriu.
  if (!linha) throw new Error(`bloco ${data}/${turno}/${setor} sumiu entre o insert e o select`);
  return linha.id;
}

/** O bloco inteiro para a tela: cabeçalho, itens em ordem, digitados e apurados. */
export async function lerBloco(data: string, turno: Turno, setor: Setor): Promise<BlocoCompleto> {
  const id = await garantirBloco(data, turno, setor);

  const [cabecalho] = await db
    .select()
    .from(passagemDeTurno)
    .where(eq(passagemDeTurno.id, id))
    .limit(1);
  if (!cabecalho) throw new Error(`bloco ${id} sumiu`);

  const itens = await db
    .select({
      id: passagemDeTurnoItem.id,
      secao: passagemDeTurnoItem.secao,
      ordem: passagemDeTurnoItem.ordem,
      dados: passagemDeTurnoItem.dados,
    })
    .from(passagemDeTurnoItem)
    .where(eq(passagemDeTurnoItem.blocoId, id))
    .orderBy(
      asc(passagemDeTurnoItem.secao),
      asc(passagemDeTurnoItem.ordem),
      asc(passagemDeTurnoItem.criadoEm),
    );

  const contadores = await db
    .select({ chave: passagemDeTurnoContador.chave, valor: passagemDeTurnoContador.valor })
    .from(passagemDeTurnoContador)
    .where(eq(passagemDeTurnoContador.blocoId, id));

  const digitados: Record<string, string> = {};
  for (const c of contadores) digitados[c.chave] = c.valor;

  return {
    id,
    data: cabecalho.data,
    turno: cabecalho.turno as Turno,
    setor: cabecalho.setor as Setor,
    assistente: cabecalho.assistente,
    supervisor: cabecalho.supervisor,
    fechadoEm: cabecalho.fechadoEm,
    fechadoAutomaticamente: cabecalho.fechadoAutomaticamente,
    itens: itens.map((i) => ({ ...i, dados: i.dados ?? {} })),
    digitados,
    apurados: await apuradosOuVazio(data, turno, setor),
  };
}

/**
 * A APURAÇÃO NÃO PODE DERRUBAR O BLOCO (2026-08-27, depois de derrubar).
 *
 * Em 26/08 a consulta dos contadores tinha um parâmetro sem tipo e o Postgres a recusava. Como ela
 * é a última coisa que `lerBloco` faz, a aba inteira da PROGRAMAÇÃO parou de abrir — ninguém
 * conseguia nem LER o que o turno anterior tinha escrito, por causa de quatro números auxiliares.
 * Os outros quatro setores, que não apuram nada, carregavam normalmente.
 *
 * A proporção estava errada. O diário é o que a operação precisa às três da manhã; o resumo apurado
 * é conveniência. Então a falha vira ausência: os contadores aparecem como "—", que é o mesmo que a
 * tela já mostra para o que ninguém preencheu.
 *
 * ── MAS ELA NÃO PODE VIRAR SILÊNCIO ───────────────────────────────────────────────────────────
 *
 * Engolir exceção é o começo do defeito que ninguém acha. O erro vai INTEIRO para o log do
 * servidor, com o bloco que o produziu — e um contador que devia ter número aparecendo vazio é
 * visível na tela, ao contrário de um zero, que ninguém questiona.
 */
async function apuradosOuVazio(
  data: string,
  turno: Turno,
  setor: Setor,
): Promise<Record<string, number>> {
  try {
    return await contadoresApurados(data, turno, setor);
  } catch (erro) {
    console.error(
      JSON.stringify({
        erro: "passagem_de_turno.apuracao_falhou",
        data,
        turno,
        setor,
        detalhe: erro instanceof Error ? erro.message : String(erro),
      }),
    );
    return {};
  }
}

// ── A escrita ───────────────────────────────────────────────────────────────────────────────────

/**
 * Grava um item — novo se `itemId` vier vazio, senão substitui o conteúdo daquele.
 *
 * A conferência do conteúdo acontece ANTES de tocar no banco, e devolve todos os problemas de uma
 * vez. Quem preencheu um cartão de seis campos merece saber os três que faltam sem ter de descobrir
 * um por envio.
 */
export async function salvarItem(
  args: {
    blocoId: string;
    itemId?: string | null;
    setor: Setor;
    secao: string;
    dados: Record<string, string>;
    ordem?: number;
  },
  userId: string,
): Promise<{ ok: true; id: string } | { ok: false; problemas: string[] }> {
  const problemas = problemasDoItem(args.setor, args.secao, args.dados);
  if (problemas.length > 0) return { ok: false, problemas };

  const aberto = await blocoAberto(args.blocoId);
  if (!aberto) return { ok: false, problemas: ["Este turno já foi entregue e não aceita edição."] };

  if (args.itemId) {
    const linhas = await db
      .update(passagemDeTurnoItem)
      .set({
        dados: args.dados,
        ordem: args.ordem ?? 0,
        atualizadoEm: new Date(),
        atualizadoPorUserId: userId,
      })
      .where(
        and(eq(passagemDeTurnoItem.id, args.itemId), eq(passagemDeTurnoItem.blocoId, args.blocoId)),
      )
      .returning({ id: passagemDeTurnoItem.id });
    const alvo = linhas[0];
    if (!alvo) return { ok: false, problemas: ["O item não existe mais."] };
    return { ok: true, id: alvo.id };
  }

  const [novo] = await db
    .insert(passagemDeTurnoItem)
    .values({
      blocoId: args.blocoId,
      secao: args.secao,
      ordem: args.ordem ?? 0,
      dados: args.dados,
      criadoPorUserId: userId,
      atualizadoPorUserId: userId,
    })
    .returning({ id: passagemDeTurnoItem.id });

  if (!novo) return { ok: false, problemas: ["Não foi possível gravar o item."] };
  return { ok: true, id: novo.id };
}

/**
 * Remove um item. Apagar de verdade, e não marcar.
 *
 * Diferente do comentário da LH, que é conversa e onde apagar abriria o buraco de alguém fazer
 * sumir o que disse: aqui o item é um RASCUNHO enquanto o turno está aberto, e some por engano de
 * digitação, não por arrependimento. Depois de entregue nada mais é removido — o bloco fechado
 * recusa esta operação como recusa todas as outras.
 */
export async function removerItem(itemId: string, blocoId: string): Promise<boolean> {
  if (!(await blocoAberto(blocoId))) return false;
  const linhas = await db
    .delete(passagemDeTurnoItem)
    .where(and(eq(passagemDeTurnoItem.id, itemId), eq(passagemDeTurnoItem.blocoId, blocoId)))
    .returning({ id: passagemDeTurnoItem.id });
  return linhas.length > 0;
}

/** Grava (ou apaga, se vier vazio) um contador digitado do resumo. */
export async function salvarContador(
  blocoId: string,
  chave: string,
  valor: string,
  userId: string,
): Promise<boolean> {
  if (!(await blocoAberto(blocoId))) return false;

  const limpo = valor.trim();
  if (limpo === "") {
    await db
      .delete(passagemDeTurnoContador)
      .where(
        and(eq(passagemDeTurnoContador.blocoId, blocoId), eq(passagemDeTurnoContador.chave, chave)),
      );
    return true;
  }

  await db
    .insert(passagemDeTurnoContador)
    .values({ blocoId, chave, valor: limpo, atualizadoPorUserId: userId })
    .onConflictDoUpdate({
      target: [passagemDeTurnoContador.blocoId, passagemDeTurnoContador.chave],
      set: { valor: limpo, atualizadoEm: new Date(), atualizadoPorUserId: userId },
    });
  return true;
}

/** Os dois nomes da faixa — assistente e supervisor. */
export async function salvarNomes(
  blocoId: string,
  nomes: { assistente?: string | null; supervisor?: string | null },
  userId: string,
): Promise<boolean> {
  const linhas = await db
    .update(passagemDeTurno)
    .set({
      ...(nomes.assistente !== undefined ? { assistente: vazioVira(nomes.assistente) } : {}),
      ...(nomes.supervisor !== undefined ? { supervisor: vazioVira(nomes.supervisor) } : {}),
      atualizadoEm: new Date(),
      atualizadoPorUserId: userId,
    })
    .where(and(eq(passagemDeTurno.id, blocoId), isNull(passagemDeTurno.fechadoEm)))
    .returning({ id: passagemDeTurno.id });
  return linhas.length > 0;
}

/**
 * Fecha o bloco — a entrega do turno.
 *
 * `isNull(fechadoEm)` na condição faz disto uma operação idempotente e à prova de dois cliques: o
 * segundo não sobrescreve quem entregou de verdade.
 */
export async function fecharBloco(blocoId: string, userId: string): Promise<boolean> {
  const linhas = await db
    .update(passagemDeTurno)
    .set({
      fechadoEm: new Date(),
      fechadoPorUserId: userId,
      fechadoAutomaticamente: false,
      atualizadoEm: new Date(),
      atualizadoPorUserId: userId,
    })
    .where(and(eq(passagemDeTurno.id, blocoId), isNull(passagemDeTurno.fechadoEm)))
    .returning({ id: passagemDeTurno.id });
  return linhas.length > 0;
}

/**
 * A TRAVA DE SEGURANÇA — fecha o que ninguém entregou (job, ver `fechar-atrasados.ts`).
 *
 * `fechadoPorUserId` fica NULO de propósito, e `fechadoAutomaticamente` verdadeiro: não houve
 * entrega, e a tela precisa poder dizer isso em vez de inventar um responsável. O `CHECK` da
 * migração permite exatamente essa combinação.
 *
 * Fecha por DATA e não por hora exata porque o corte é grosso por natureza — o objetivo é impedir
 * edição retroativa dias depois, não cravar o segundo em que o turno acabou.
 */
export async function fecharAtrasados(diasDeCarencia = 1): Promise<number> {
  const linhas = await db
    .update(passagemDeTurno)
    .set({ fechadoEm: new Date(), fechadoAutomaticamente: true, atualizadoEm: new Date() })
    .where(
      and(
        isNull(passagemDeTurno.fechadoEm),
        lt(
          passagemDeTurno.data,
          sql`(now() at time zone 'America/Sao_Paulo')::date - ${diasDeCarencia}`,
        ),
      ),
    )
    .returning({ id: passagemDeTurno.id });
  return linhas.length;
}

// ── A linha do tempo ────────────────────────────────────────────────────────────────────────────

export interface LinhaDoTempoItem extends Bloco {
  itens: number;
}

/**
 * Os blocos já entregues, do mais recente para o mais antigo.
 *
 * Traz a CONTAGEM de itens, não os itens: a linha do tempo é uma lista para escolher o que abrir, e
 * carregar o conteúdo de trinta blocos para mostrar trinta linhas seria carregar o diário inteiro
 * a cada abertura de página.
 */
export async function linhaDoTempo(setor: Setor | null, limite = 30): Promise<LinhaDoTempoItem[]> {
  const linhas = await db
    .select({
      id: passagemDeTurno.id,
      data: passagemDeTurno.data,
      turno: passagemDeTurno.turno,
      setor: passagemDeTurno.setor,
      assistente: passagemDeTurno.assistente,
      supervisor: passagemDeTurno.supervisor,
      fechadoEm: passagemDeTurno.fechadoEm,
      fechadoAutomaticamente: passagemDeTurno.fechadoAutomaticamente,
      itens: sql<number>`(
        select count(*)::int from ${passagemDeTurnoItem}
         where ${passagemDeTurnoItem.blocoId} = ${passagemDeTurno.id}
      )`,
    })
    .from(passagemDeTurno)
    .where(setor ? eq(passagemDeTurno.setor, setor) : sql`true`)
    .orderBy(desc(passagemDeTurno.data), asc(passagemDeTurno.turno), asc(passagemDeTurno.setor))
    .limit(limite);

  return linhas.map((l) => ({
    ...l,
    turno: l.turno as Turno,
    setor: l.setor as Setor,
    itens: Number(l.itens ?? 0),
  }));
}

// ── O que o TMS apura sozinho ───────────────────────────────────────────────────────────────────

/**
 * OS CONTADORES QUE O BANCO SABE RESPONDER — e só eles.
 *
 * São quatro, todos da Programação. A primeira versão do catálogo marcava quinze como calculados; ao
 * conferir coluna por coluna, só estes quatro tinham dado confiável atrás. Os outros teriam mostrado
 * ZERO com cara de número apurado, que é a pior saída num resumo de turno — ninguém desconfia de um
 * zero. O que falta para promover cada um está anotado no catálogo, em `pendencia`.
 *
 * ── O RECORTE É A JANELA DE COLETA PLANEJADA ──────────────────────────────────────────────────
 *
 * "Quantos no show no meu turno" quer dizer "das viagens que deveriam coletar durante o meu turno".
 * A janela é `planned_pickup_window_start`, que é o mesmo campo que a Minha Programação usa para
 * dizer o que é de hoje — se os dois números discordassem, a pergunta "qual vale?" voltaria.
 *
 * ── E ELA É CALCULADA EM HORA DE SÃO PAULO ────────────────────────────────────────────────────
 *
 * `(data + hora) at time zone 'America/Sao_Paulo'` devolve o instante UTC daquela parede de
 * relógio. Montar a janela em UTC deslocaria todo turno em três horas: o T1 pegaria das 4h às 16h
 * locais, e as coletas das 16h às 19h — o fim da tarde inteiro — cairiam no turno errado.
 */
export async function contadoresApurados(
  data: string,
  turno: Turno,
  setor: Setor,
): Promise<Record<string, number>> {
  if (setor !== "PROGRAMACAO") return {};

  const { inicio, fim } = janelaDoTurno(data, turno);

  const linhas = await db.execute<{
    no_show: string;
    pendente_confirmacao: string;
    sem_atribuicao: string;
    cancelamento: string;
  }>(sql`
    select
      count(*) filter (where p.status = 'NO_SHOW')::text                       as no_show,
      count(*) filter (where p.status in ('A_ENVIAR', 'ENVIADO'))::text        as pendente_confirmacao,
      count(*) filter (where t.current_status = 'received')::text              as sem_atribuicao,
      count(*) filter (where t.current_status = 'cancelled')::text             as cancelamento
      from trips t
      left join trip_programacao p on p.trip_id = t.id
     where t.planned_pickup_window_start >= ${inicio}
       and t.planned_pickup_window_start <  ${fim}
  `);

  const r = linhas[0];
  if (!r) return {};
  return {
    no_show: Number(r.no_show ?? 0),
    pendente_confirmacao: Number(r.pendente_confirmacao ?? 0),
    sem_atribuicao: Number(r.sem_atribuicao ?? 0),
    cancelamento: Number(r.cancelamento ?? 0),
  };
}

/**
 * AS HORAS DA JANELA DE UM TURNO, contadas a partir da meia-noite do dia do bloco.
 *
 * ── O DIA SEGUINTE ENTRA NAS HORAS, E NÃO COMO UMA PARCELA PRÓPRIA ────────────────────────────
 *
 * O T2 termina no dia seguinte — `fimHora <= inicioHora` é o sinal de que cruza a meia-noite —, e a
 * forma óbvia de escrever isso em SQL seria `data::date + 1 + '7 hours'::interval`.
 *
 * **Isso não funciona, e falha sempre.** Aquele `+ 1` vira um PARÂMETRO SEM TIPO (`$4`), e
 * `date + $4` é ambíguo para o Postgres: existem `date + integer`, `date + interval`, `date + time`
 * e `date + timetz`. Sem cast ele não escolhe — recusa a consulta inteira, nos dois turnos.
 *
 * Somar 24 às horas faz o parâmetro sumir: `'31 hours'::interval` diz a mesma coisa com um cast só.
 *
 * ── O MODO COMO ISSO APARECEU ENGANOU ─────────────────────────────────────────────────────────
 *
 * Como a apuração só existe para a PROGRAMAÇÃO, os outros quatro setores carregavam normalmente e
 * só aquela aba quebrava. Parece defeito de tela, e está no SQL.
 */
export function horasDaJanela(turno: Turno): { inicio: number; fim: number } {
  const def = DEFINICAO_DO_TURNO[turno];
  return {
    inicio: def.inicioHora,
    fim: def.fimHora <= def.inicioHora ? def.fimHora + 24 : def.fimHora,
  };
}

/**
 * As duas pontas da janela, em hora de São Paulo.
 *
 * `(data + horas) at time zone 'America/Sao_Paulo'` devolve o instante UTC daquela parede de
 * relógio. Montar a janela em UTC deslocaria todo turno em três horas: o T1 pegaria das 4h às 16h
 * locais, e as coletas do fim da tarde cairiam no turno errado.
 *
 * Exportada para o teste, que confere o SQL gerado sem precisar de banco — é o único jeito de
 * provar a ausência do parâmetro sem tipo antes de a consulta chegar ao Postgres.
 */
export function janelaDoTurno(data: string, turno: Turno) {
  const horas = horasDaJanela(turno);
  return {
    inicio: sql`((${data}::date + ${horaSql(horas.inicio)}) at time zone 'America/Sao_Paulo')`,
    fim: sql`((${data}::date + ${horaSql(horas.fim)}) at time zone 'America/Sao_Paulo')`,
  };
}

/**
 * A hora como intervalo, para somar a uma data.
 *
 * Vai como texto parametrizado (`'7 hours'::interval`) e não interpolado na consulta — a hora vem
 * de um catálogo nosso e não de entrada de usuário, mas a diferença some no dia em que alguém
 * tornar o turno configurável, e aí o hábito é que protege.
 *
 * O `::interval` NÃO é enfeite: sem ele o parâmetro fica sem tipo e `date + $n` vira ambíguo. Ver
 * `horasDaJanela`.
 */
function horaSql(hora: number) {
  return sql`${`${hora} hours`}::interval`;
}

/** Um bloco só aceita escrita enquanto está aberto. */
async function blocoAberto(blocoId: string): Promise<boolean> {
  const [linha] = await db
    .select({ id: passagemDeTurno.id })
    .from(passagemDeTurno)
    .where(and(eq(passagemDeTurno.id, blocoId), isNull(passagemDeTurno.fechadoEm)))
    .limit(1);
  return linha !== undefined;
}

const vazioVira = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

/** Os contadores que ESTE código sabe apurar. O teste cruza com o catálogo — ver a nota lá. */
export const CONTADORES_APURADOS: readonly string[] = [
  "no_show",
  "pendente_confirmacao",
  "sem_atribuicao",
  "cancelamento",
];

/** Só para o teste: a lista de chaves que o catálogo marca como `calculado`, por setor e turno. */
export function chavesCalculadasNoCatalogo(setor: Setor, turno: Turno): string[] {
  return contadoresDo(setor, turno)
    .filter((c) => c.fonte === "calculado")
    .map((c) => c.chave);
}

/**
 * O setor da conta — lido do banco, não da sessão.
 *
 * ── POR QUE NÃO ENTRA NO COOKIE DE SESSÃO ─────────────────────────────────────────────────────
 *
 * Seria uma consulta a menos por escrita, e um defeito a mais: o setor mudaria no cadastro e a
 * pessoa continuaria com o antigo até sair e entrar de novo. Num recurso cujo ponto INTEIRO é
 * "só quem é do setor edita", uma permissão que demora a virar é exatamente o que não pode
 * acontecer — e o sintoma seria "tirei o setor dela e ela continua editando".
 *
 * A consulta é por chave primária e só roda em escrita. É barata onde importa.
 */
export async function setorDoUsuario(userId: string): Promise<Setor | null> {
  const linhas = await db.execute<{ setor: string | null }>(
    sql`select setor from users where id = ${userId} limit 1`,
  );
  return setorValido(linhas[0]?.setor);
}
