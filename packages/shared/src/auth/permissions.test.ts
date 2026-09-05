import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  ASSIGNABLE_ROLES,
  can,
  ROLE_PERMISSIONS,
  SEM_CAPACIDADES,
  Role,
  type PermissionKey,
  type Role as RoleType,
} from "./permissions";

/**
 * O QUE O PAPEL ALCANÇAVA — a pergunta que este arquivo faz 59 vezes.
 *
 * Até 31/08 isto era `can(papel, chave)`. A fatia 029 tirou o papel do caminho: `can` passou a
 * receber o CONJUNTO da pessoa, vindo do cargo dela no banco.
 *
 * Os casos abaixo continuam valendo inteiros, e mudaram de assunto sem mudar de conteúdo: eles
 * sempre foram sobre a MATRIZ, e a matriz agora é a SEMENTE da migração `0060`. É ela que a
 * semeadura reproduz, e é contra ela que `db:conferir-acesso` compara o banco. Um caso que caia aqui
 * quer dizer que a virada deixaria alguém com acesso diferente do que tem hoje.
 *
 * A conta é a mesma que `can` fazia antes — inclusive o `?? false` para papel fora do catálogo, que
 * é o caso real do `customer_viewer`.
 */
function alcanca(papel: RoleType, chave: PermissionKey): boolean {
  return ROLE_PERMISSIONS[papel]?.has(chave) ?? false;
}

/**
 * Expected grants, transcribed independently from contracts/permission-matrix.md (PRD §18).
 * ✓ and ◐ both count as granted. This is the source of truth the catalog must match.
 */
const EXPECTED: Record<RoleType, PermissionKey[]> = {
  admin: [...ALL_PERMISSIONS], // superset
  operations_manager: [
    "view_all_trips",
    "import_trips",
    "edit_trip_plan",
    "assign_resources",
    // As duas marcas seguem quem despacha (032) — ver o comentario de marcar_sm no catalogo.
    "marcar_sm",
    "marcar_cte",
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
  ],
  dispatcher: [
    "view_all_trips",
    "edit_trip_plan",
    "assign_resources",
    // As duas marcas seguem quem despacha (032) — ver o comentario de marcar_sm no catalogo.
    "marcar_sm",
    "marcar_cte",
    "update_trip_status",
    "cancel_trip",
    "create_exceptions",
    "resolve_exceptions",
    "upload_documents",
    "view_freight_rates",
  ],
  control_tower: [
    "view_all_trips",
    "edit_trip_plan",
    "update_trip_status",
    "mark_completed",
    "create_exceptions",
    "resolve_exceptions",
    "upload_documents",
    "view_freight_rates",
  ],
  fleet_coordinator: [
    "view_all_trips",
    "assign_resources",
    // As duas marcas seguem quem despacha (032) — ver o comentario de marcar_sm no catalogo.
    "marcar_sm",
    "marcar_cte",
    "create_exceptions",
    "resolve_exceptions",
    "upload_documents",
    "manage_fleet_data",
    "view_freight_rates",
  ],
  finance: [
    "view_all_trips",
    "mark_billing_ready",
    "resolve_dispute",
    "upload_documents",
    "verify_documents",
    "edit_rates",
    "export_billing",
    "view_freight_rates",
    "import_freight_rates",
  ],
  executive_viewer: ["view_all_trips", "view_freight_rates"],
};

const ALL_ROLES = Object.values(Role);

describe("alcanca() — full matrix (7 roles × all permission keys)", () => {
  for (const role of ALL_ROLES) {
    for (const key of ALL_PERMISSIONS) {
      const expected = EXPECTED[role].includes(key);
      it(`${role} ${expected ? "CAN" : "cannot"} ${key}`, () => {
        expect(alcanca(role, key)).toBe(expected);
      });
    }
  }
});

describe("invariants", () => {
  it("Admin is a superset (true for every key)", () => {
    for (const key of ALL_PERMISSIONS) {
      expect(alcanca(Role.Admin, key)).toBe(true);
    }
  });

  it("manage_users and view_audit_log are Admin-only", () => {
    for (const role of ALL_ROLES) {
      const adminOnly = role === Role.Admin;
      expect(alcanca(role, "manage_users")).toBe(adminOnly);
      expect(alcanca(role, "view_audit_log")).toBe(adminOnly);
    }
  });

  it("Executive Viewer can only view_all_trips and view_freight_rates (016)", () => {
    for (const key of ALL_PERMISSIONS) {
      expect(alcanca(Role.ExecutiveViewer, key)).toBe(
        key === "view_all_trips" || key === "view_freight_rates",
      );
    }
  });

  it("customer_viewer is not an assignable role", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("customer_viewer");
    expect(ASSIGNABLE_ROLES).toHaveLength(7);
  });

  it("alcanca() returns false for an unknown role", () => {
    expect(alcanca("customer_viewer" as RoleType, "view_all_trips")).toBe(false);
  });
});

describe("002 master-data permission invariants (contracts/permission-matrix.md)", () => {
  it("Admin and Ops Manager hold both manage_commercial_data and manage_fleet_data", () => {
    for (const role of [Role.Admin, Role.OperationsManager] as const) {
      expect(alcanca(role, "manage_commercial_data")).toBe(true);
      expect(alcanca(role, "manage_fleet_data")).toBe(true);
    }
  });

  it("Fleet Coordinator manages fleet but NOT commercial data", () => {
    expect(alcanca(Role.FleetCoordinator, "manage_fleet_data")).toBe(true);
    expect(alcanca(Role.FleetCoordinator, "manage_commercial_data")).toBe(false);
  });

  it("manage_commercial_data and manage_fleet_data are granted to no other role", () => {
    const otherRoles = [
      Role.Dispatcher,
      Role.ControlTower,
      Role.Finance,
      Role.ExecutiveViewer,
    ] as const;
    for (const role of otherRoles) {
      expect(alcanca(role, "manage_commercial_data")).toBe(false);
      expect(alcanca(role, "manage_fleet_data")).toBe(false);
    }
  });

  it("archive of master data uses the Admin-only delete_archive key", () => {
    for (const role of ALL_ROLES) {
      expect(alcanca(role, "delete_archive")).toBe(role === Role.Admin);
    }
  });
});

describe("003 trip-domain permission invariants (contracts/permission-matrix.md)", () => {
  it("Admin and Operations Manager hold manage_trips", () => {
    expect(alcanca(Role.Admin, "manage_trips")).toBe(true);
    expect(alcanca(Role.OperationsManager, "manage_trips")).toBe(true);
  });

  it("Dispatcher and Finance do NOT hold manage_trips (their trip keys arrive in later slices)", () => {
    expect(alcanca(Role.Dispatcher, "manage_trips")).toBe(false);
    expect(alcanca(Role.Finance, "manage_trips")).toBe(false);
  });

  it("no other role holds manage_trips", () => {
    for (const role of ALL_ROLES) {
      const expected = role === Role.Admin || role === Role.OperationsManager;
      expect(alcanca(role, "manage_trips")).toBe(expected);
    }
  });

  it("customer_viewer (reserved, non-assignable) does not hold manage_trips", () => {
    expect(alcanca("customer_viewer" as RoleType, "manage_trips")).toBe(false);
  });
});

describe("004 trip-import permission invariants (contracts/permission-matrix.md — import_trips, no new key)", () => {
  it("Admin and Operations Manager hold import_trips", () => {
    expect(alcanca(Role.Admin, "import_trips")).toBe(true);
    expect(alcanca(Role.OperationsManager, "import_trips")).toBe(true);
  });

  it("Dispatcher, Control Tower, Finance, Executive Viewer do NOT hold import_trips", () => {
    expect(alcanca(Role.Dispatcher, "import_trips")).toBe(false);
    expect(alcanca(Role.ControlTower, "import_trips")).toBe(false);
    expect(alcanca(Role.Finance, "import_trips")).toBe(false);
    expect(alcanca(Role.ExecutiveViewer, "import_trips")).toBe(false);
  });

  it("import_trips is granted to exactly Admin + Operations Manager", () => {
    for (const role of ALL_ROLES) {
      const expected = role === Role.Admin || role === Role.OperationsManager;
      expect(alcanca(role, "import_trips")).toBe(expected);
    }
  });

  it("customer_viewer (reserved, non-assignable) does not hold import_trips", () => {
    expect(alcanca("customer_viewer" as RoleType, "import_trips")).toBe(false);
  });
});

describe("005 control-tower permission invariants (contracts/permission-matrix.md — first enforcement of view_all_trips)", () => {
  it("all 7 internal roles hold view_all_trips (read the Control Tower / detail / dashboard / export)", () => {
    for (const role of ALL_ROLES) {
      expect(alcanca(role, "view_all_trips")).toBe(true);
    }
    expect(ALL_ROLES).toHaveLength(7);
  });

  it("editing live planned fields stays manage_trips (Admin + Ops Manager only; the 'Limited' scope is BLOCKED)", () => {
    expect(alcanca(Role.Admin, "manage_trips")).toBe(true);
    expect(alcanca(Role.OperationsManager, "manage_trips")).toBe(true);
    expect(alcanca(Role.Dispatcher, "manage_trips")).toBe(false);
    expect(alcanca(Role.ControlTower, "manage_trips")).toBe(false);
    expect(alcanca(Role.FleetCoordinator, "manage_trips")).toBe(false);
    expect(alcanca(Role.Finance, "manage_trips")).toBe(false);
    expect(alcanca(Role.ExecutiveViewer, "manage_trips")).toBe(false);
  });
});

describe("006 dispatch-assignment permission invariants (contracts/permission-matrix.md — first enforcement of assign_resources)", () => {
  it("assign_resources is granted to Admin, Operations Manager, Dispatcher, and Fleet Coordinator", () => {
    for (const role of [
      Role.Admin,
      Role.OperationsManager,
      Role.Dispatcher,
      Role.FleetCoordinator,
    ] as const) {
      expect(alcanca(role, "assign_resources")).toBe(true);
    }
  });

  it("assign_resources is denied to Control Tower, Finance, and Executive Viewer", () => {
    for (const role of [Role.ControlTower, Role.Finance, Role.ExecutiveViewer] as const) {
      expect(alcanca(role, "assign_resources")).toBe(false);
    }
  });

  it("assign_resources is granted to exactly those four roles", () => {
    for (const role of ALL_ROLES) {
      const expected =
        role === Role.Admin ||
        role === Role.OperationsManager ||
        role === Role.Dispatcher ||
        role === Role.FleetCoordinator;
      expect(alcanca(role, "assign_resources")).toBe(expected);
    }
  });

  it("a Dispatcher holding assign_resources does NOT hold manage_fleet_data (the resource-options gap 006 fills)", () => {
    expect(alcanca(Role.Dispatcher, "assign_resources")).toBe(true);
    expect(alcanca(Role.Dispatcher, "manage_fleet_data")).toBe(false);
  });
});

describe("007 execution/exception/SLA permission invariants (contracts/permission-matrix.md — no new key)", () => {
  it("update_trip_status (milestones/notes) is granted to Admin, Ops Manager, Dispatcher, Control Tower", () => {
    for (const role of [
      Role.Admin,
      Role.OperationsManager,
      Role.Dispatcher,
      Role.ControlTower,
    ] as const) {
      expect(alcanca(role, "update_trip_status")).toBe(true);
    }
  });

  it("update_trip_status is denied to Fleet Coordinator, Finance, Executive Viewer", () => {
    for (const role of [Role.FleetCoordinator, Role.Finance, Role.ExecutiveViewer] as const) {
      expect(alcanca(role, "update_trip_status")).toBe(false);
    }
  });

  it("create_exceptions/resolve_exceptions are granted to those four PLUS Fleet Coordinator", () => {
    for (const role of [
      Role.Admin,
      Role.OperationsManager,
      Role.Dispatcher,
      Role.ControlTower,
      Role.FleetCoordinator,
    ] as const) {
      expect(alcanca(role, "create_exceptions")).toBe(true);
      expect(alcanca(role, "resolve_exceptions")).toBe(true);
    }
  });

  it("create_exceptions/resolve_exceptions are denied to Finance and Executive Viewer", () => {
    for (const role of [Role.Finance, Role.ExecutiveViewer] as const) {
      expect(alcanca(role, "create_exceptions")).toBe(false);
      expect(alcanca(role, "resolve_exceptions")).toBe(false);
    }
  });

  it("SLA-rule admin reuses manage_commercial_data (Admin + Ops Manager only)", () => {
    for (const role of ALL_ROLES) {
      const expected = role === Role.Admin || role === Role.OperationsManager;
      expect(alcanca(role, "manage_commercial_data")).toBe(expected);
    }
  });
});

describe("008 documents/billing permission invariants (contracts/permission-matrix.md — first enforcement, no new key)", () => {
  it("upload_documents = everyone except Executive Viewer", () => {
    for (const role of [
      Role.Admin,
      Role.OperationsManager,
      Role.Dispatcher,
      Role.ControlTower,
      Role.FleetCoordinator,
      Role.Finance,
    ] as const) {
      expect(alcanca(role, "upload_documents")).toBe(true);
    }
    expect(alcanca(Role.ExecutiveViewer, "upload_documents")).toBe(false);
  });

  it("verify_documents = Admin, Ops Manager, Finance", () => {
    for (const role of ALL_ROLES) {
      const expected =
        role === Role.Admin || role === Role.OperationsManager || role === Role.Finance;
      expect(alcanca(role, "verify_documents")).toBe(expected);
    }
  });

  it("mark_completed = Admin, Ops Manager, Control Tower", () => {
    for (const role of ALL_ROLES) {
      const expected =
        role === Role.Admin || role === Role.OperationsManager || role === Role.ControlTower;
      expect(alcanca(role, "mark_completed")).toBe(expected);
    }
  });

  it("mark_billing_ready / edit_rates / export_billing = Admin + Finance only", () => {
    for (const key of ["mark_billing_ready", "edit_rates", "export_billing"] as const) {
      for (const role of ALL_ROLES) {
        const expected = role === Role.Admin || role === Role.Finance;
        expect(alcanca(role, key)).toBe(expected);
      }
    }
  });

  it("document requirements/types reuse manage_commercial_data (Admin + Ops Manager)", () => {
    for (const role of ALL_ROLES) {
      const expected = role === Role.Admin || role === Role.OperationsManager;
      expect(alcanca(role, "manage_commercial_data")).toBe(expected);
    }
  });

  it("Ops Manager holds mark_completed but NOT mark_billing_ready (Finance owns the billing gate)", () => {
    expect(alcanca(Role.OperationsManager, "mark_completed")).toBe(true);
    expect(alcanca(Role.OperationsManager, "mark_billing_ready")).toBe(false);
  });

  it("a Dispatcher can upload but cannot verify (verify is the review authority)", () => {
    expect(alcanca(Role.Dispatcher, "upload_documents")).toBe(true);
    expect(alcanca(Role.Dispatcher, "verify_documents")).toBe(false);
  });
});

/**
 * `can` DEPOIS DA FATIA 029 — a verificação sobre o conjunto, e não sobre o papel.
 *
 * A função ficou trivial de propósito: ela responde uma pergunta sobre um `Set`, e mais nada. Toda a
 * complexidade — de onde o conjunto vem, o que acontece sem cargo — saiu daqui para `evaluateProfile`
 * e para o banco.
 *
 * Estes casos existem para trancar essa trivialidade. No dia em que alguém acrescentar um "se não
 * achar, tenta o papel antigo" aqui dentro, é neste bloco que a ideia morre.
 */
describe("can() sobre o conjunto (fatia 029)", () => {
  it("responde pelo que está no conjunto, e por nada mais", () => {
    const quemPede = { permissoes: new Set<PermissionKey>(["view_all_trips", "assign_resources"]) };
    expect(can(quemPede, "view_all_trips")).toBe(true);
    expect(can(quemPede, "assign_resources")).toBe(true);
    expect(can(quemPede, "manage_users")).toBe(false);
    expect(can(quemPede, "delete_archive")).toBe(false);
  });

  it("conjunto VAZIO recusa tudo — é o que vale para quem está sem cargo", () => {
    /**
     * O caso que mais importa do arquivo inteiro. Quem não tem cargo NÃO cai no papel antigo: cai
     * aqui. Um fallback para `ROLE_PERMISSIONS` faria a tela continuar funcionando quando a leitura
     * do cargo quebrasse, e ninguém descobriria — até alguém editar um cargo e nada acontecer.
     *
     * Vazio é barulhento, e é o lado certo de errar: o outro lado é conceder o que ninguém pediu.
     */
    for (const chave of ALL_PERMISSIONS) {
      expect(can({ permissoes: SEM_CAPACIDADES }, chave)).toBe(false);
    }
  });

  it("NÃO consulta o papel — mesmo o de administrador", () => {
    // Um objeto que tem `role: "admin"` e conjunto vazio alcança ZERO. É a prova de que o papel
    // saiu do caminho: se ele fosse consultado em qualquer lugar, este caso passaria a `true`.
    const disfarcado = { role: "admin", permissoes: SEM_CAPACIDADES };
    expect(can(disfarcado, "manage_users")).toBe(false);
  });
});
