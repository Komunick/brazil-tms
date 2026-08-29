import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { isNull } from "drizzle-orm";
import { drivers } from "./drivers";
import { driverPreregistrationStatus, driverPreregistrationType } from "./enums";
import { resourceDocuments } from "./resource-documents";
import { users } from "./users";

/**
 * O PRÉ-CADASTRO DE MOTORISTA PARCEIRO, preenchido pelo próprio motorista (fatia 028).
 *
 * O motivo, os números e o porquê de cada decisão estão na migração `0057`, que é onde eles
 * sobrevivem a uma leitura de banco sem o repositório em mãos. Aqui fica só o que o TypeScript
 * precisa saber — e as duas armadilhas que se paga caro por esquecer.
 *
 * ── DUAS TABELAS, E O REENVIO ANEXA ───────────────────────────────────────────────────────────
 *
 * Este é o pré-cadastro: UM por CPF, mutável, é o que a fila mostra. O envio é a tabela irmã, e
 * nunca muda depois de escrito. Quando o mesmo CPF manda de novo, NÃO nasce linha nova aqui —
 * nasce uma submissão apontando para esta. Senão o mesmo motorista apareceria três vezes na fila.
 *
 * ── ISTO NÃO É `drivers` ──────────────────────────────────────────────────────────────────────
 *
 * Nada aqui escreve no cadastro de motorista. `drivers` só muda depois da conferência, por decisão
 * explícita de uma pessoa. Um formulário público com caminho direto até o cadastro seria uma porta
 * aberta — e é justamente por isso que os dois vivem separados.
 */
export const driverPreregistrations = pgTable(
  "driver_preregistrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Só DÍGITOS, normalizado na entrada. O formulário aceita "390.533.447-05" e aqui chega
     * "39053344705": se a pontuação chegasse até o banco, a deduplicação falharia por formatação e
     * o mesmo motorista viraria dois — sem erro nenhum para denunciar.
     */
    cpf: text("cpf").notNull(),
    tipo: driverPreregistrationType("tipo").notNull(),
    /** Preenchido só quando `tipo = atualizacao`: o motorista que já existe. */
    driverId: uuid("driver_id").references(() => drivers.id),
    status: driverPreregistrationStatus("status").notNull().default("recebido"),
    /**
     * Os valores consolidados COM A ORIGEM de cada um (lido do documento · do CEP · digitado ·
     * declarado). A origem é requisito da conferência, não enfeite: quem confere precisa olhar com
     * atenção diferente para o que a máquina leu e para o que a pessoa digitou.
     */
    campos: jsonb("campos").notNull().default({}),
    /**
     * O toxicológico NÃO EXISTE na API da gerenciadora — zero ocorrências no manual inteiro, lido
     * do PDF. Ele mora só na tela deles. Então é capturado como declaração e fica marcado como AÇÃO
     * MANUAL até alguém resolver, nunca um endpoint inventado.
     */
    pendenciaToxicologico: boolean("pendencia_toxicologico").notNull().default(true),
    toxicologicoResolvidoPor: uuid("toxicologico_resolvido_por").references(() => users.id),
    toxicologicoResolvidoEm: timestamp("toxicologico_resolvido_em", { withTimezone: true }),
    // O descarte MARCA, não apaga. É o que torna o índice de CPF parcial.
    arquivadoEm: timestamp("arquivado_em", { withTimezone: true }),
    arquivadoPor: uuid("arquivado_por").references(() => users.id),
    arquivadoMotivo: text("arquivado_motivo"),
    conferidoPor: uuid("conferido_por").references(() => users.id),
    conferidoEm: timestamp("conferido_em", { withTimezone: true }),
    enviadoPor: uuid("enviado_por").references(() => users.id),
    enviadoEm: timestamp("enviado_em", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * UM pré-cadastro ABERTO por CPF — a garantia mora no banco, não na aplicação.
     *
     * Parcial porque um CPF arquivado pode voltar: alguém descartou por engano, ou a pessoa se
     * recadastra meses depois. O que não pode é dois abertos ao mesmo tempo.
     */
    uniqueIndex("driver_preregistrations_cpf_aberto_uq")
      .on(table.cpf)
      .where(isNull(table.arquivadoEm)),
    index("driver_preregistrations_fila_idx")
      .on(table.status, table.createdAt)
      .where(isNull(table.arquivadoEm)),
  ],
);

/**
 * Cada ENVIO, e nunca alterado depois de escrito.
 *
 * `dados` guarda o que chegou EXATAMENTE como chegou. O normalizado vive no pré-cadastro; aqui fica
 * o cru, para responder "o que ele mandou?" mesmo depois de alguém corrigir na conferência. É a
 * mesma decisão de `portal_commands.response` — e foi ela que permitiu achar um defeito que a
 * versão traduzida escondia.
 */
export const driverPreregistrationSubmissions = pgTable(
  "driver_preregistration_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    preregistrationId: uuid("preregistration_id")
      .notNull()
      .references(() => driverPreregistrations.id),
    recebidoEm: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow(),
    /**
     * HASH da origem, NUNCA o IP.
     *
     * Para conter repetição basta saber que é A MESMA origem. Saber QUAL é dado pessoal que não
     * precisamos guardar — e que, guardado, vira responsabilidade sem contrapartida.
     */
    origemHash: text("origem_hash"),
    dados: jsonb("dados").notNull(),
    // As fotos vivem na fatia 025 (bucket privado, histórico, link de curta duração). Aqui só as
    // chaves — nada de binário nem de caminho de arquivo solto.
    documentoCnhId: uuid("documento_cnh_id").references(() => resourceDocuments.id),
    documentoComprovanteId: uuid("documento_comprovante_id").references(() => resourceDocuments.id),
  },
  (table) => [
    index("driver_preregistration_submissions_prereg_idx").on(
      table.preregistrationId,
      table.recebidoEm,
    ),
  ],
);
