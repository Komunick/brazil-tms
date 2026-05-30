import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS,
  ASSIGNABLE_ROLES,
  can,
  Role,
  type PermissionKey,
  type Role as RoleType,
} from "./permissions";

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
  ],
  dispatcher: [
    "view_all_trips",
    "edit_trip_plan",
    "assign_resources",
    "update_trip_status",
    "cancel_trip",
    "create_exceptions",
    "resolve_exceptions",
    "upload_documents",
  ],
  control_tower: [
    "view_all_trips",
    "edit_trip_plan",
    "update_trip_status",
    "mark_completed",
    "create_exceptions",
    "resolve_exceptions",
    "upload_documents",
  ],
  fleet_coordinator: [
    "view_all_trips",
    "assign_resources",
    "create_exceptions",
    "resolve_exceptions",
    "upload_documents",
    "manage_fleet_data",
  ],
  finance: [
    "view_all_trips",
    "mark_billing_ready",
    "resolve_dispute",
    "upload_documents",
    "verify_documents",
    "edit_rates",
    "export_billing",
  ],
  executive_viewer: ["view_all_trips"],
};

const ALL_ROLES = Object.values(Role);

describe("can() — full matrix (7 roles × all permission keys)", () => {
  for (const role of ALL_ROLES) {
    for (const key of ALL_PERMISSIONS) {
      const expected = EXPECTED[role].includes(key);
      it(`${role} ${expected ? "CAN" : "cannot"} ${key}`, () => {
        expect(can(role, key)).toBe(expected);
      });
    }
  }
});

describe("invariants", () => {
  it("Admin is a superset (true for every key)", () => {
    for (const key of ALL_PERMISSIONS) {
      expect(can(Role.Admin, key)).toBe(true);
    }
  });

  it("manage_users and view_audit_log are Admin-only", () => {
    for (const role of ALL_ROLES) {
      const adminOnly = role === Role.Admin;
      expect(can(role, "manage_users")).toBe(adminOnly);
      expect(can(role, "view_audit_log")).toBe(adminOnly);
    }
  });

  it("Executive Viewer can only view_all_trips", () => {
    for (const key of ALL_PERMISSIONS) {
      expect(can(Role.ExecutiveViewer, key)).toBe(key === "view_all_trips");
    }
  });

  it("customer_viewer is not an assignable role", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("customer_viewer");
    expect(ASSIGNABLE_ROLES).toHaveLength(7);
  });

  it("can() returns false for an unknown role", () => {
    expect(can("customer_viewer" as RoleType, "view_all_trips")).toBe(false);
  });
});

describe("002 master-data permission invariants (contracts/permission-matrix.md)", () => {
  it("Admin and Ops Manager hold both manage_commercial_data and manage_fleet_data", () => {
    for (const role of [Role.Admin, Role.OperationsManager] as const) {
      expect(can(role, "manage_commercial_data")).toBe(true);
      expect(can(role, "manage_fleet_data")).toBe(true);
    }
  });

  it("Fleet Coordinator manages fleet but NOT commercial data", () => {
    expect(can(Role.FleetCoordinator, "manage_fleet_data")).toBe(true);
    expect(can(Role.FleetCoordinator, "manage_commercial_data")).toBe(false);
  });

  it("manage_commercial_data and manage_fleet_data are granted to no other role", () => {
    const otherRoles = [
      Role.Dispatcher,
      Role.ControlTower,
      Role.Finance,
      Role.ExecutiveViewer,
    ] as const;
    for (const role of otherRoles) {
      expect(can(role, "manage_commercial_data")).toBe(false);
      expect(can(role, "manage_fleet_data")).toBe(false);
    }
  });

  it("archive of master data uses the Admin-only delete_archive key", () => {
    for (const role of ALL_ROLES) {
      expect(can(role, "delete_archive")).toBe(role === Role.Admin);
    }
  });
});
