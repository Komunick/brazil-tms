/**
 * Static role -> permission catalog (contracts/permission-matrix.md, PRD §18).
 * The single source of truth for authorization, consumed by both the BFF (`requireAuth` + `can`)
 * and the app-shell nav. No DB permissions table (FR-008, Constitution V). Feature 001 *enforces*
 * only `manage_users` and `view_audit_log`; the rest are declared now so features 002–009 add
 * enforcement points without editing this catalog (FR-010).
 */

export const Role = {
  Admin: "admin",
  OperationsManager: "operations_manager",
  Dispatcher: "dispatcher",
  ControlTower: "control_tower",
  FleetCoordinator: "fleet_coordinator",
  Finance: "finance",
  ExecutiveViewer: "executive_viewer",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** The 7 assignable MVP roles. `customer_viewer` is a reserved DB enum value, NOT a Role (FR-007). */
export const ASSIGNABLE_ROLES: readonly Role[] = Object.values(Role);

export type PermissionKey =
  // enforced in 001:
  | "manage_users"
  | "view_audit_log"
  // declared now, enforced by later features (002–009):
  | "view_all_trips"
  | "import_trips"
  | "edit_trip_plan"
  | "assign_resources"
  | "update_trip_status"
  | "cancel_trip"
  | "mark_completed"
  | "mark_billing_ready"
  | "resolve_dispute"
  | "delete_archive"
  | "create_exceptions"
  | "resolve_exceptions"
  | "upload_documents"
  | "verify_documents"
  | "edit_rates"
  | "export_billing"
  // added by 002 (master data): create/edit/read commercial vs fleet entities (permission-matrix.md):
  | "manage_commercial_data"
  | "manage_fleet_data"
  // added by 003 (trip domain): create/transition/plan-update/cancel trips + read trip inspector:
  | "manage_trips"
  // added by 016 (freight rate lookup): internal agregados rate table — view for the 7 internal
  // roles, replace-by-upload mirrors the "edit_rates" precedent (Admin + Finance):
  | "view_freight_rates"
  | "import_freight_rates";

export const ALL_PERMISSIONS: readonly PermissionKey[] = [
  "manage_users",
  "view_audit_log",
  "view_all_trips",
  "import_trips",
  "edit_trip_plan",
  "assign_resources",
  "update_trip_status",
  "cancel_trip",
  "mark_completed",
  "mark_billing_ready",
  "resolve_dispute",
  "delete_archive",
  "create_exceptions",
  "resolve_exceptions",
  "upload_documents",
  "verify_documents",
  "edit_rates",
  "export_billing",
  "manage_commercial_data",
  "manage_fleet_data",
  "manage_trips",
  "view_freight_rates",
  "import_freight_rates",
];

// Admin is a superset of every permission (matrix invariant).
const ADMIN_PERMISSIONS = new Set<PermissionKey>(ALL_PERMISSIONS);

/**
 * SEMENTE DA MIGRAÇÃO `0060` — e **fora do caminho de execução** desde 31/08 (fatia 029).
 *
 * Isto foi, até a 029, a fonte da autorização: `can(papel, chave)` lia daqui, e mudar o que alguém
 * alcançava exigia um deploy. O resultado, medido: **20 dos 34 usuários ativos eram `admin`**, porque
 * quem precisava de uma combinação que não existia neste objeto não tinha para onde ir.
 *
 * Hoje quem manda são as tabelas `cargos` e `cargo_permissoes`, e este objeto sobrevive por dois
 * motivos, os dois de conferência:
 *
 *   1. a migração `0060` foi semeada a partir dele, e `cargos-schema.test.ts` compara o SQL com ele
 *      cargo a cargo — é o que garante que ninguém perdeu acesso na virada;
 *   2. `db:conferir-acesso` o usa como o lado "antes" da comparação contra o banco de verdade.
 *
 * **NENHUM código de execução pode voltar a lê-lo para decidir acesso.** Quem está sem cargo tem
 * conjunto vazio (`SEM_CAPACIDADES`), e não o papel antigo. Ver o comentário de `can`.
 *
 * (✓ e ◐ contam as duas como concedidas; ver `contracts/permission-matrix.md`.)
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<PermissionKey>> = {
  admin: ADMIN_PERMISSIONS,
  operations_manager: new Set<PermissionKey>([
    "view_all_trips",
    "import_trips",
    "edit_trip_plan",
    "assign_resources",
    "update_trip_status",
    "cancel_trip",
    "mark_completed",
    "resolve_dispute",
    "create_exceptions",
    "resolve_exceptions",
    "upload_documents",
    "verify_documents",
    "manage_commercial_data",
    "manage_fleet_data",
    "manage_trips",
    "view_freight_rates",
  ]),
  dispatcher: new Set<PermissionKey>([
    "view_all_trips",
    "edit_trip_plan",
    "assign_resources",
    "update_trip_status",
    "cancel_trip",
    "create_exceptions",
    "resolve_exceptions",
    "upload_documents",
    "view_freight_rates",
  ]),
  control_tower: new Set<PermissionKey>([
    "view_all_trips",
    "edit_trip_plan",
    "update_trip_status",
    "mark_completed",
    "create_exceptions",
    "resolve_exceptions",
    "upload_documents",
    "view_freight_rates",
  ]),
  fleet_coordinator: new Set<PermissionKey>([
    "view_all_trips",
    "assign_resources",
    "create_exceptions",
    "resolve_exceptions",
    "upload_documents",
    "manage_fleet_data",
    "view_freight_rates",
  ]),
  finance: new Set<PermissionKey>([
    "view_all_trips",
    "mark_billing_ready",
    "resolve_dispute",
    "upload_documents",
    "verify_documents",
    "edit_rates",
    "export_billing",
    "view_freight_rates",
    "import_freight_rates",
  ]),
  executive_viewer: new Set<PermissionKey>(["view_all_trips", "view_freight_rates"]),
};

/**
 * QUEM ESTÁ PEDINDO — e tudo o que `can` precisa saber sobre a pessoa.
 *
 * Não é o usuário inteiro de propósito: `can` é uma função pura sobre um CONJUNTO, e receber o
 * usuário convidaria a decidir por nome, por e-mail ou por papel em algum lugar. Recebendo só as
 * capacidades, não há o que consultar além delas.
 */
export interface Principal {
  readonly permissoes: ReadonlySet<PermissionKey>;
}

/**
 * A VERIFICAÇÃO DE PERMISSÃO — agora sobre o CONJUNTO, e não sobre o papel (2026-08-31, fatia 029).
 *
 * ── POR QUE A ASSINATURA MUDOU, E POR QUE ISSO É A PROTEÇÃO E NÃO O CUSTO ─────────────────────
 *
 * O conjunto passou a vir do cargo, que é dado no banco. Manter `can(papel, chave)` viva ao lado
 * criaria DOIS caminhos de autorização — o novo, que a tela de cargos governa, e o antigo, que
 * ninguém mais edita — e o antigo continuaria compilando para sempre. Quem escrevesse a próxima tela
 * escolheria o errado sem nenhum aviso.
 *
 * Trocar a assinatura faz o COMPILADOR apontar cada um dos 62 pontos que chamavam isto direto. Foi a
 * troca que tornou a migração segura, e não um detalhe de estilo: um `tsc` limpo é a prova de que
 * nenhum ficou para trás.
 *
 * ── E `ROLE_PERMISSIONS` SAI DAQUI ────────────────────────────────────────────────────────────
 *
 * Ela continua exportada porque a migração `0060` foi semeada a partir dela e há testes que a
 * comparam com o SQL. Mas NENHUM código de execução pode voltar a lê-la para decidir acesso: quem
 * está sem cargo tem conjunto VAZIO, e não o papel antigo. Um fallback esconderia exatamente o
 * defeito que mais importa — se a leitura do cargo quebrasse, tudo continuaria funcionando e ninguém
 * saberia que a autorização voltou a ser a de código, até alguém editar um cargo e nada acontecer.
 */
export function can(principal: Principal, permission: PermissionKey): boolean {
  return principal.permissoes.has(permission);
}

/**
 * O conjunto vazio, nomeado — para quem está sem cargo.
 *
 * Existe para que a ausência seja escrita como ausência, e não como um `new Set()` solto que o
 * leitor precisa interpretar. Falha FECHADA: entra no sistema e não vê nada.
 */
export const SEM_CAPACIDADES: ReadonlySet<PermissionKey> = new Set<PermissionKey>();
