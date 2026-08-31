/**
 * Typed audit actions (data-model.md / research §10). The DB column is plain text; this union is
 * extended per feature. Feature 001 emits the four user-administration actions below.
 */
export type AuditAction =
  | "user.create"
  | "user.role_change"
  | "user.status_change"
  // 2026-08-26: o setor da passagem de turno. Ele decide quem escreve no diário de turno, e "quem
  // passou a poder escrever nisto, e quando" é exatamente o que a auditoria existe para responder.
  | "user.setor_change"
  | "user.invite_sent"
  // feature 002 — master data (data-model.md §Audit actions). `<entity>.create|update|archive` for
  // all seven entities; `+ .status_change` for the three operational resources.
  | "customer.create"
  | "customer.update"
  | "customer.archive"
  | "location.create"
  | "location.update"
  | "location.archive"
  | "lane.create"
  | "lane.update"
  | "lane.archive"
  | "carrier.create"
  | "carrier.update"
  | "carrier.archive"
  | "driver.create"
  | "driver.update"
  | "driver.archive"
  | "driver.status_change"
  | "vehicle.create"
  | "vehicle.update"
  | "vehicle.archive"
  | "vehicle.status_change"
  | "trailer.create"
  | "trailer.update"
  | "trailer.archive"
  | "trailer.status_change"
  // feature 003 — trip domain (data-model.md §Audit actions). Every critical-field change and
  // lifecycle action writes exactly one immutable audit row (SC-003).
  // 2026-08-21 — a decisao de aceitar/rejeitar a viagem NO PORTAL, tomada daqui.
  // Apertar no portal nao deixa rastro nenhum do nosso lado: ninguem sabe quem aceitou, quando,
  // nem por que recusou. Estas duas sao a resposta a essas perguntas.
  | "trip.portal_accept"
  | "trip.portal_reject"
  | "trip.portal_assign"
  // 2026-08-28 — o PAR de cada uma: o que o PORTAL respondeu, gravado quando ele responde.
  // As de cima provam a decisão; estas provam o desfecho, com o `retcode` e a mensagem como
  // vieram. Sem elas a prova existia só em `portal_commands.response`, invisível sem SQL — e
  // uma tarde inteira foi gasta em 28/08 achando que aceites não chegavam ao portal.
  | "trip.portal_accept_result"
  | "trip.portal_reject_result"
  | "trip.portal_assign_result"
  // 2026-08-29 — o leilão de spot ABRIU, e se o aviso saiu ou não.
  // `bid_status` era lido pelo ciclo de spot e descartado; quando alguém perguntou por que um
  // spot não foi avisado, não havia o que olhar. O ciclo do plano vê TODAS as viagens sem janela,
  // então esta linha é o robô se pegando falhar.
  | "trip.portal_auction_open"
  // O descarte da fila de pré-cadastro (fatia 028). ARQUIVA, não apaga — princípio III.
  | "preregistration.archive"
  // A conferência: alguém leu o que a máquina extraiu e corrigiu. Guarda o ANTES e o DEPOIS de cada
  // campo mexido — é o que separa "o modelo errou" de "o motorista mandou errado", meses depois.
  | "preregistration.reviewed"
  | "preregistration.sent"
  // A METADE COBRADA. Este registro existe para a fatura ter dono: quem apertou, quando, e com
  // quais opções pagas marcadas. Sem ele o gasto é anônimo por construção.
  | "preregistration.pesquisa_requested"
  // 026 — a ponte rota → modelo de Pré-SM. Confirmar AUTORIZA GASTO: a gerenciadora cobra por
  // solicitação, e uma rota confirmada passa a gerar Pré-SM sozinha. Quem confirmou fica registrado.
  | "pre_sm.modelo.confirmar"
  | "pre_sm.modelo.desconfirmar"
  | "pre_sm.enviar"
  | "pre_sm.cidade.confirmar"
  | "pre_sm.cidade.desconfirmar"
  // O cancelamento de uma Pré-SM já criada — e já cobrada pela gerenciadora.
  | "pre_sm.cancelar"
  /*
    2026-08-31, fatia 029 — o acesso deixou de ser catálogo em código e passou a ser dado editável.
    O princípio IV da constituição exige auditar MUDANÇA DE PERMISSÃO, e agora ela acontece pela
    tela: criar cargo, mudar o que ele alcança, desativá-lo, mover pessoa de um cargo para outro.

    "cargo.alterado" guarda a LISTA INTEIRA antes e depois, nunca a diferença — só assim se responde
    "o que este cargo alcançava no dia 12?" sem somar todas as alterações desde o começo.
  */
  | "cargo.criado"
  | "cargo.alterado"
  | "cargo.desativado"
  | "usuario.cargo_alterado"
  | "user.foto_alterada"
  | "user.foto_descartada"
  | "selo.criado"
  | "selo.apagado"
  | "usuario.selos_alterados"
  | "trip.create" // newValue = original_plan summary + initial status
  | "trip.plan_update" // accepted customer update to live planned_* fields (per-field prev/new)
  | "trip.fields_update" // the operation's own annotations (solicitação, checklist, SM Raster, CT-e, doca)
  | "trip.status_change" // prev/new current_status (also recorded as a trip_event)
  | "trip.cancel" // reason_code, responsible_party, billing_impact, cancelled_at
  /**
   * A viagem que o cliente RETIROU do portal antes de qualquer coisa acontecer (2026-08-18).
   *
   * É a ÚNICA ação neste arquivo que registra uma linha que deixou de existir — e existe exatamente
   * por isso. A auditoria não tem chave estrangeira para `trips`, então ela sobrevive à remoção: é o
   * que resta para responder "e a LT1Q8I02EDDT1, que eu vi ontem?". `newValue` guarda o número da
   * viagem, o cliente e há quantas horas ela não aparecia; `reason`, a varredura que a removeu.
   */
  | "trip.purge_withdrawn"
  // feature 004 — trip import (data-model.md §Audit actions). Batch upload + confirm, plus the
  // config surfaces (templates, status mappings, location aliases). Per-trip `trip.create` /
  // `trip.plan_update` (003) also fire during confirm, with `reason` referencing the batch id.
  | "import.create" // batch uploaded (entityType 'import_batch')
  | "import.confirm" // batch confirmed (entityType 'import_batch')
  | "import_template.create"
  | "import_template.update"
  | "status_mapping.upsert"
  | "location_alias.create"
  // feature 006 — dispatch assignment (data-model.md §3.5 / research §8). Each assignment mutation
  // writes exactly one audit row with the resource-rich prev/new snapshot; `reason` carries the
  // override reason when a WARN was overridden.
  | "trip.assign"
  | "trip.reassign"
  | "trip.unassign"
  | "trip.confirm"
  // feature 007 — execution events, exceptions & SLA rules (data-model §9.4 / R13). Exception
  // lifecycle, free-form notes, and per-customer SLA-rule admin each write one audit row. Milestones
  // reuse `trip.status_change`; SLA recompute + alert generate/acknowledge are NOT audit actions.
  | "exception.create"
  | "exception.update"
  | "exception.resolve"
  | "exception.cancel"
  | "trip.note"
  | "sla_rule.create"
  | "sla_rule.update"
  // feature 008 — documents, completion, billing readiness, rates & export (data-model §9.4 / R12).
  // Document verification + rate/billing changes + export are explicitly must-audit (Constitution IV).
  // Completion/Billing-Ready/Billed transitions reuse `trip.status_change` (via `transitionTripStatus`).
  | "document.upload"
  | "document.verify"
  | "document.waive"
  | "document.archive"
  | "document_requirement.create"
  | "document_requirement.update"
  | "document_type.create"
  | "document_type.update"
  | "rate.create"
  | "rate.update"
  | "billing_item.update"
  | "billing.export"
  // feature 016 — freight rate lookup: the replace-all sheet upload is the single mutation.
  | "freight_rate.replace"
  // slice 025 — driver/vehicle registry attachments ("Documentos" tab, issue #32). Append-only:
  // one audit row per upload; there is no update/delete surface to audit.
  // Tirar um motorista de circulação (2026-08-25, a pedido). NÃO é `driver.status_change`: aquele
  // é o status operacional, e o bloqueio tem campo próprio para não se confundir com o
  // `status = 'blocked'` que a carga do portal escreve quando o CLIENTE desativa alguém.
  | "driver.block"
  | "driver.unblock"
  | "driver.document_upload"
  | "vehicle.document_upload"
  // Removal of a user who never acted (no auditable history — see `deleteUser`). The row is gone,
  // but this entry, written by the acting admin, keeps WHO removed WHOM.
  | "user.delete";

/** The four actions audited by feature 001 (useful for tests / iteration). */
export const AUDIT_ACTIONS_001: readonly AuditAction[] = [
  "user.create",
  "user.role_change",
  "user.status_change",
  "user.invite_sent",
];

/**
 * Every audit action across 001–004 (the global audit screen must have an `AuditActions` i18n label
 * for each — the screen looks up `action.replaceAll(".", "_")`). Kept in lockstep with the union above;
 * `satisfies` flags a typo, and the i18n guard test asserts each has a label.
 */
export const ALL_AUDIT_ACTIONS = [
  "user.create",
  "user.role_change",
  "user.status_change",
  "user.setor_change",
  "user.invite_sent",
  "user.delete",
  "customer.create",
  "customer.update",
  "customer.archive",
  "location.create",
  "location.update",
  "location.archive",
  "lane.create",
  "lane.update",
  "lane.archive",
  "carrier.create",
  "carrier.update",
  "carrier.archive",
  "driver.create",
  "driver.update",
  "driver.archive",
  "driver.status_change",
  "vehicle.create",
  "vehicle.update",
  "vehicle.archive",
  "vehicle.status_change",
  "trailer.create",
  "trailer.update",
  "trailer.archive",
  "trailer.status_change",
  "trip.create",
  "trip.plan_update",
  "trip.fields_update",
  "trip.status_change",
  "trip.cancel",
  "trip.purge_withdrawn",
  "import.create",
  "import.confirm",
  "import_template.create",
  "import_template.update",
  "status_mapping.upsert",
  "location_alias.create",
  "trip.assign",
  "trip.reassign",
  "trip.unassign",
  "trip.confirm",
  "exception.create",
  "exception.update",
  "exception.resolve",
  "exception.cancel",
  "trip.note",
  "sla_rule.create",
  "sla_rule.update",
  "document.upload",
  "document.verify",
  "document.waive",
  "document.archive",
  "document_requirement.create",
  "document_requirement.update",
  "document_type.create",
  "document_type.update",
  "rate.create",
  "rate.update",
  "billing_item.update",
  "billing.export",
  "freight_rate.replace",
  "driver.block",
  "driver.unblock",
  "driver.document_upload",
  "vehicle.document_upload",
  "trip.portal_accept",
  "trip.portal_reject",
  "trip.portal_assign",
  "trip.portal_accept_result",
  "trip.portal_reject_result",
  "trip.portal_assign_result",
  "trip.portal_auction_open",
  "preregistration.archive",
  "preregistration.reviewed",
  "preregistration.sent",
  "preregistration.pesquisa_requested",
  "pre_sm.modelo.confirmar",
  "pre_sm.modelo.desconfirmar",
  "pre_sm.enviar",
  "pre_sm.cidade.confirmar",
  "pre_sm.cidade.desconfirmar",
  "pre_sm.cancelar",
  "cargo.criado",
  "cargo.alterado",
  "cargo.desativado",
  "usuario.cargo_alterado",
  "user.foto_alterada",
  "user.foto_descartada",
  "selo.criado",
  "selo.apagado",
  "usuario.selos_alterados",
] as const satisfies readonly AuditAction[];

/**
 * Input to `writeAudit` — the durable record minus DB-generated fields (id, created_at).
 * previous/new values are snapshots of only the relevant fields, never whole rows.
 */
export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: AuditAction;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  actorUserId: string;
  reason?: string | null;
}
