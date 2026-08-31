import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { appRole } from "./enums";

/**
 * `auth.users` is owned by GoTrue — declared here ONLY so we can reference it for the FK.
 * It is NOT created or migrated by us (drizzle.config schemaFilter is ["public"]).
 */
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

/**
 * Application profile + role binding (data-model.md). `id` mirrors `auth.users.id` (1:1, no
 * surrogate key). No hard delete — disabling sets `status='disabled'` (Constitution III).
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: appRole("role").notNull(),
    // 'pending' | 'active' | 'disabled' — enforced by the CHECK below and the shared Zod schemas.
    status: text("status").notNull(),
    /**
     * O SETOR DA PASSAGEM DE TURNO — e ele NÃO é um papel (2026-08-26).
     *
     * `role` diz o que a pessoa pode FAZER no TMS e alimenta a matriz de permissões. `setor` diz
     * qual FAIXA do diário de turno ela responde. Um `dispatcher` pode estar em PROGRAMAÇÃO ou em
     * SPOT; um `control_tower` em GR ou em Monitoring. Somar as duas coisas num enum só
     * multiplicaria os oito papéis por cinco e quebraria a matriz inteira.
     *
     * NULO É O NORMAL: a maioria dos usuários não faz passagem de turno. Quem não tem setor lê
     * tudo e não edita nada, que é o certo para quem só acompanha.
     */
    setor: text("setor"),
    /**
     * O CARGO — o que esta pessoa alcança (2026-08-31, fatia 029). Ver `schema/cargos.ts`.
     *
     * ── POR QUE ELE É NULO, E POR QUE ISSO NÃO É DESCUIDO ─────────────────────────────────────
     *
     * Pô-lo `NOT NULL` na migração que o cria abriria uma janela mortal. Neste repositório o deploy
     * **não aplica migração** (ver `docs/OPERACAO.md`): migra-se à mão, e nesse momento quem está
     * respondendo é o app ANTERIOR — que cria usuário e não sabe preencher esta coluna. O `insert`
     * falharia, e o cadastro de usuário quebraria em produção por alguns minutos.
     *
     * Quem sustenta "ninguém fica sem cargo" até o `NOT NULL` de uma fatia futura é a APLICAÇÃO:
     * criar usuário exige cargo, e apagar cargo com gente dentro exige destino.
     *
     * ── E SE ESTIVER NULO, O CONJUNTO É VAZIO ─────────────────────────────────────────────────
     *
     * NUNCA `ROLE_PERMISSIONS[role]`. Um fallback para o papel antigo esconderia exatamente o
     * defeito que mais importa: se a leitura do cargo quebrasse, tudo continuaria funcionando e
     * ninguém saberia que a autorização voltou a ser a de código — até alguém editar um cargo e
     * nada acontecer.
     *
     * ── SEM `.references()` AQUI, E É DELIBERADO ──────────────────────────────────────────────
     *
     * A chave estrangeira EXISTE, e é criada na migração `0060`. Declará-la neste arquivo faria
     * `users.ts` importar `cargos.ts`, que já importa `users.ts` por causa de `usuario_selos` — um
     * ciclo de importação que o drizzle não resolve bem. O banco garante a integridade de qualquer
     * jeito; quem "consertar" isto acrescentando o `references` cria o ciclo de volta.
     */
    cargoId: uuid("cargo_id"),
    /**
     * Quando esta pessoa foi desativada — o relógio dos 90 dias da foto de perfil (FR-024).
     *
     * **Zerado ao reativar**, e é assim que a reativação "para o relógio" sem nenhuma regra especial:
     * a varredura diária filtra por esta coluna, então quem volta some do alvo sozinho.
     */
    desativadoEm: timestamp("desativado_em", { withTimezone: true }),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_role_idx").on(table.role),
    check("users_status_check", sql`${table.status} in ('pending', 'active', 'disabled')`),
    check(
      "users_setor_ck",
      sql`${table.setor} is null or ${table.setor} in ('PROGRAMACAO', 'SPOT', 'EMISSAO', 'GR', 'MONITORING')`,
    ),
  ],
);
