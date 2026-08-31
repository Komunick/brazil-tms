import { sql } from "drizzle-orm";
import { boolean, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * O CARGO — o que uma pessoa alcança no TMS, e agora é DADO e não código (2026-08-31, fatia 029).
 *
 * ── O QUE ESTAVA ERRADO, MEDIDO ANTES DE MEXER ────────────────────────────────────────────────
 *
 * Dos 34 usuários ativos, **20 eram `admin`** — 14 `dispatcher`, 1 `operations_manager`, e ZERO nos
 * outros quatro papéis do enum. Não era desleixo de cadastro: o catálogo de papéis vive em código, e
 * quem precisava de uma combinação que não existia nele não tinha para onde ir. Virava admin.
 *
 * O preço: vinte pessoas podendo apagar arquivo, exportar faturamento e mexer em usuário porque
 * precisavam ver a Expedição.
 *
 * ── E O MOTIVO QUE OLHA PARA A FRENTE ─────────────────────────────────────────────────────────
 *
 * Vão entrar sistemas de OUTROS SETORES no TMS. O cargo editável é o que vai separar quem pode ver
 * de quem pode mexer sem passar por um deploy — e é por isso que ele guarda CAPACIDADES e não
 * páginas: setor novo traz tela nova, tela nova traz capacidade nova, e ela aparece sozinha na tela
 * de cargos porque o catálogo é derivado do menu.
 *
 * ── O QUE **NÃO** MUDA, E É O PONTO ───────────────────────────────────────────────────────────
 *
 * Quem DECIDE continua sendo o BFF, no mesmo `requirePermission` de sempre. Esta tabela muda de onde
 * ele LÊ o conjunto, nunca quem decide. Um segundo caminho de autorização é o defeito que a fatia
 * inteira existe para não criar.
 */
export const cargos = pgTable("cargos", {
  id: uuid("id").primaryKey().defaultRandom(),
  /**
   * RÓTULO, e não chave. Renomear "Despachante" para "Programação" não muda o acesso de ninguém —
   * quem manda é o `id`, e é por isso que o vínculo em `users` aponta para ele e não para o nome.
   */
  nome: text("nome").notNull().unique(),
  /**
   * Desativar em vez de apagar (princípio III da constituição). Um cargo apagado levaria junto o
   * histórico de auditoria de quem esteve nele — e é justamente esse histórico que responde "por que
   * fulano conseguia cancelar viagem em março?".
   */
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * O QUE CADA CARGO ALCANÇA — uma linha por capacidade, e NÃO um array.
 *
 * ── POR QUE UMA LINHA POR CAPACIDADE ──────────────────────────────────────────────────────────
 *
 * A pergunta que decide a forma desta tabela é a da trava do último administrador, e ela é feita
 * DENTRO de uma transação, sob concorrência:
 *
 *     quantas pessoas ATIVAS ainda alcançam `manage_users`?
 *
 * Assim ela é um `join` comum com índice comum, com trava de linha funcionando como em qualquer
 * outro. Com `jsonb` ou `text[]` a mesma pergunta vira varredura de contenção e pede índice GIN —
 * mais máquina para responder pior.
 *
 * KISS aqui não é "menos tabelas", é menos coisa para entender. O array economizaria uma tabela e
 * cobraria em toda consulta.
 *
 * ── SEM CHECK AMARRANDO AO CATÁLOGO, E É DE PROPÓSITO ─────────────────────────────────────────
 *
 * O vocabulário das 23 capacidades vive em TypeScript (`PermissionKey`) e cresce a cada fatia. Um
 * CHECK aqui obrigaria uma migração a cada capacidade nova, e uma migração esquecida recusaria a
 * gravação de algo que o código já entende.
 *
 * Quem valida é o Zod na entrada da rota, e o cargo só oferece o que o catálogo mostra. Uma linha
 * gravada com uma chave que o código não reconhece simplesmente nunca é concedida por `can` — falha
 * FECHADA, que é o lado certo de errar num modelo de autorização.
 */
export const cargoPermissoes = pgTable(
  "cargo_permissoes",
  {
    cargoId: uuid("cargo_id")
      .notNull()
      .references(() => cargos.id, { onDelete: "cascade" }),
    /** Uma `PermissionKey` do catálogo compartilhado. Ver o comentário acima sobre a falta de CHECK. */
    permissao: text("permissao").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.cargoId, table.permissao] }),
    // O índice da pergunta da trava: "quem alcança `manage_users`?" parte da PERMISSÃO, não do cargo,
    // e a chave primária composta só serve a consultas que começam pelo `cargo_id`.
    index("cargo_permissoes_permissao_idx").on(table.permissao),
  ],
);

/**
 * OS SELOS — reconhecimento, e NUNCA acesso (2026-08-31, a pedido).
 *
 * "Beta tester", "Líder", "Supervisor". Aparecem no mini perfil e ao lado do nome, com cor.
 *
 * ── ELES NÃO DÃO PERMISSÃO NENHUMA, E ISSO É ESTRUTURAL ───────────────────────────────────────
 *
 * O pedido citava o Discord, onde vários cargos SOMAM permissões. Foi decidido contra, e o motivo é
 * a pergunta que se faz depois de um incidente: *"por que fulano conseguia cancelar?"*. Com soma, a
 * resposta exige juntar três cargos e conferir a união. Com um cargo só, a resposta é uma linha.
 *
 * A separação é FÍSICA, e é o que torna a regra verificável: não existe caminho desta tabela até
 * `cargo_permissoes`. Ninguém precisa confiar em disciplina de quem escreve o código depois.
 */
export const selos = pgTable("selos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull().unique(),
  /** Uma cor da paleta fechada da interface — o valor aceito é validado pelo Zod na rota. */
  cor: text("cor").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/** Quem tem qual selo. Uma pessoa pode ter vários — ao contrário do cargo, que é exatamente um. */
export const usuarioSelos = pgTable(
  "usuario_selos",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seloId: uuid("selo_id")
      .notNull()
      .references(() => selos.id, { onDelete: "cascade" }),
    aplicadoPor: uuid("aplicado_por")
      .notNull()
      .references(() => users.id),
    aplicadoEm: timestamp("aplicado_em", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.seloId] }),
    index("usuario_selos_selo_idx").on(table.seloId),
  ],
);
