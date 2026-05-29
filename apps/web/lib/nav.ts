import type { PermissionKey } from "@brazil-tms/shared";

export interface NavItem {
  /** Key under the `Nav` i18n namespace (messages/pt-BR.json). */
  key: string;
  href: string;
  /** lucide-react icon name, resolved in the sidebar component. */
  icon: string;
  /** Required permission; `undefined` = visible to any authenticated user. */
  permission?: PermissionKey;
}

/**
 * Role-gated navigation. The sidebar filters items via `can(role, permission)`; hiding is
 * additive only — the BFF stays authoritative (FR-011). Operational areas (features 002–009)
 * are added here as those features land.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "home", href: "/", icon: "LayoutDashboard" },
  { key: "adminUsers", href: "/admin/users", icon: "Users", permission: "manage_users" },
  { key: "adminAudit", href: "/admin/audit", icon: "ScrollText", permission: "view_audit_log" },
];
