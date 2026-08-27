import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * A PASSAGEM DE TURNO — o diário que hoje vive numa planilha (2026-08-26, a pedido).
 *
 * O que a planilha é está em `docs/PROPOSTA-PASSAGEM-DE-TURNO.md`; a forma de cada setor, em
 * `packages/shared/src/domain/passagem-de-turno.ts`; o porquê de cada coluna, na migração
 * `0054_passagem_de_turno.sql`, que é onde essa história cabe inteira.
 *
 * Aqui, só o que o resto do código precisa para ler e escrever.
 */

/**
 * A LISTA DE SETORES E TURNOS mora em `@brazil-tms/shared`, e não aqui.
 *
 * Mesma razão de `trip-programacao.ts`: a TELA desenha os cinco setores e precisa da lista, e a
 * tela não pode importar valor deste pacote — importaria o cliente de Postgres junto. Reexportada
 * para quem já lê o schema não ter de saber disso.
 */
export {
  SETORES,
  TURNOS,
  type Setor,
  type Turno,
  SECOES_DO_SETOR,
  contadoresDo,
  turnoDe,
} from "@brazil-tms/shared";

/** O bloco `(data, turno, setor)` — dez por dia, e nenhum precisa ser criado à mão. */
export const passagemDeTurno = pgTable(
  "passagem_de_turno",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * A data LOCAL de São Paulo do dia em que o turno COMEÇOU.
     *
     * `date` e não `timestamptz` porque é rótulo de calendário, não instante — e porque o T2
     * atravessa a meia-noite: às 2h de quinta o plantonista está no bloco de quarta. Quem faz essa
     * conta é `turnoDe`, e o teste dela é onde o defeito estaria.
     */
    data: date("data").notNull(),
    turno: text("turno").notNull(),
    setor: text("setor").notNull(),

    /**
     * Os dois nomes da faixa. TEXTO, não referência a `users`: quem assina o turno pode não ter
     * conta, e uma chave estrangeira transformaria "escrever quem estava" em "cadastrar quem
     * estava". Quem editou de fato fica em `atualizadoPorUserId`.
     */
    assistente: text("assistente"),
    supervisor: text("supervisor"),

    fechadoEm: timestamp("fechado_em", { withTimezone: true }),
    fechadoPorUserId: uuid("fechado_por_user_id").references(() => users.id),
    /** Fechado pela trava de segurança, sem ninguém para entregar. A tela diz isso. */
    fechadoAutomaticamente: boolean("fechado_automaticamente").notNull().default(false),

    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoPorUserId: uuid("atualizado_por_user_id").references(() => users.id),
  },
  (t) => [
    /**
     * A chave única é o que permite ao bloco "já existir": a rota faz `on conflict do nothing` e
     * segue. Sem ela, dois operadores abrindo a mesma faixa no mesmo segundo criariam dois blocos e
     * escreveriam cada um no seu, sem aviso nenhum.
     */
    unique("passagem_de_turno_unico").on(t.data, t.turno, t.setor),
    index("passagem_de_turno_data_idx").on(t.data, t.turno, t.setor),
    check("passagem_de_turno_turno_ck", sql`${t.turno} in ('T1', 'T2')`),
    check(
      "passagem_de_turno_setor_ck",
      sql`${t.setor} in ('PROGRAMACAO', 'SPOT', 'EMISSAO', 'GR', 'MONITORING')`,
    ),
    check(
      "passagem_de_turno_fechamento_ck",
      sql`(${t.fechadoEm} is null and ${t.fechadoPorUserId} is null) or ${t.fechadoEm} is not null`,
    ),
  ],
);

/**
 * Uma ocorrência anotada. `secao` é a chave declarada em `SECOES_DO_SETOR` — sem chave estrangeira,
 * porque o catálogo é código e não tabela.
 *
 * O conteúdo em `dados` NÃO é validado pelo banco: é o preço de ter uma tabela em vez de vinte.
 * Quem valida é `problemasDoItem`, na rota, antes de gravar.
 */
export const passagemDeTurnoItem = pgTable(
  "passagem_de_turno_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blocoId: uuid("bloco_id")
      .notNull()
      .references(() => passagemDeTurno.id, { onDelete: "cascade" }),
    secao: text("secao").notNull(),
    /** A planilha tem ordem e a operação a usa: o primeiro da lista é o mais urgente. */
    ordem: integer("ordem").notNull().default(0),
    dados: jsonb("dados")
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Record<string, string>>(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    criadoPorUserId: uuid("criado_por_user_id").references(() => users.id),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoPorUserId: uuid("atualizado_por_user_id").references(() => users.id),
  },
  (t) => [
    index("passagem_de_turno_item_bloco_idx").on(t.blocoId, t.secao, t.ordem),
    check("passagem_de_turno_item_objeto_ck", sql`jsonb_typeof(${t.dados}) = 'object'`),
  ],
);

/**
 * Só o contador DIGITADO. O que o TMS calcula não se grava — seria uma cópia envelhecendo ao lado
 * do fato.
 *
 * `valor` é TEXTO e não inteiro, por prova: na planilha de 25/08 "Bloqueios" está com `-` e
 * "ON TIME" com `x`. São respostas legítimas — "não se aplica", "não medi" — e um inteiro
 * obrigaria a inventar zero, que afirma outra coisa.
 */
export const passagemDeTurnoContador = pgTable(
  "passagem_de_turno_contador",
  {
    blocoId: uuid("bloco_id")
      .notNull()
      .references(() => passagemDeTurno.id, { onDelete: "cascade" }),
    chave: text("chave").notNull(),
    valor: text("valor").notNull(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoPorUserId: uuid("atualizado_por_user_id").references(() => users.id),
  },
  (t) => [primaryKey({ columns: [t.blocoId, t.chave] })],
);
