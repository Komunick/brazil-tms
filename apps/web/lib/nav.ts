import type { PermissionKey } from "@brazil-tms/shared";

export interface NavItem {
  /** Key under the `Nav` i18n namespace (messages/pt-BR.json). */
  key: string;
  href: string;
  /** lucide-react icon name, resolved in the sidebar component. */
  icon: string;
  /** Required permission; `undefined` = visible to any authenticated user. */
  permission?: PermissionKey;
  /**
   * O grupo em que este item aparece, sob a chave `Nav.grupos` (2026-08-23, a pedido).
   *
   * O menu chegou a vinte e três itens sem nenhuma hierarquia: Início e Auditoria tinham o mesmo
   * peso, e achar qualquer coisa exigia ler a lista inteira de cima a baixo.
   *
   * O grupo é uma etiqueta, não uma pasta: nada recolhe, nada esconde. O que ele faz é dar ao olho
   * pontos de parada — e o item continua a um clique, como sempre foi.
   */
  grupo: "operacao" | "faturamento" | "analise" | "importacao" | "cadastros" | "sistema";
}

/** A ordem dos grupos na barra. Do que se usa todo dia para o que se abre uma vez por mês. */
export const NAV_GRUPOS = [
  "operacao",
  "faturamento",
  "analise",
  "importacao",
  "cadastros",
  "sistema",
] as const;

/**
 * Role-gated navigation. The sidebar filters items via `can(role, permission)`; hiding is
 * additive only — the BFF stays authoritative (FR-011). Operational areas (features 002–009)
 * are added here as those features land.
 */
/**
 * OS ÍCONES, revistos (2026-08-23, a pedido).
 *
 * O defeito que motivou a revisão era real e passava despercebido: o MESMO caminhão marcava a
 * Torre de Controle e o cadastro de Veículos. Dois lugares diferentes com o mesmo desenho é pior
 * do que um desenho genérico — e com o menu recolhido, onde só o ícone resta, viravam a mesma
 * coisa.
 *
 * As trocas:
 *
 *   Torre de Controle   caminhão → torre de controle (o nome da tela vira o desenho)
 *   Expedição           prancheta → pacote conferido (despachar, não conferir lista)
 *   Tarifas             cifrão → moedas            ┐ três telas de dinheiro seguidas com o mesmo
 *   Tabela de Fretes    nota → tabela              ┘ peso; agora cada uma diz o que é
 *   Locais              alfinete → alfinete fixado (estação, não um ponto qualquer)
 *   Motoristas          pessoa → crachá (a pessoa cadastrada, não um usuário do sistema)
 *   Transportadoras     fábrica → aperto de mão (parceiro, não indústria)
 *
 * ── POR QUE OS ÍCONES NÃO GANHARAM COR ────────────────────────────────────────────────────────
 *
 * Foi oferecido, e a resposta é a mesma que vale no resto do sistema: COR AQUI SIGNIFICA ESTADO.
 * Vermelho é atraso, verde é andando, laranja é oportunidade — e essa gramática só funciona
 * enquanto a cor for rara. Vinte e quatro ícones coloridos na barra gastariam a paleta inteira em
 * decoração, e o vermelho da LH atrasada passaria a ser mais um vermelho na tela.
 *
 * Quem separa os grupos são os títulos, que já fazem esse trabalho sem custo. E a cor continua
 * onde decide alguma coisa: no item ativo, que é a única pergunta que a barra responde com tinta.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "home", href: "/", icon: "LayoutDashboard", grupo: "operacao" },
  // Minha Programação (2026-08-23): a lista pessoal de viagens acompanhadas. Logo abaixo do
  // Início porque é a segunda coisa que se abre — o painel diz como está o dia, esta diz o que é meu.
  {
    key: "minhaProgramacao",
    href: "/minha-programacao",
    icon: "Star",
    permission: "view_all_trips",
    grupo: "operacao",
  },
  // 005 — Control Tower board (view_all_trips: all 7 internal roles).
  {
    key: "trips",
    href: "/trips",
    icon: "TowerControl",
    permission: "view_all_trips",
    grupo: "operacao",
  },
  // 006 — Dispatch Board (assign_resources: Admin, Ops Manager, Dispatcher, Fleet Coordinator).
  {
    key: "dispatch",
    href: "/dispatch",
    icon: "PackageCheck",
    permission: "assign_resources",
    grupo: "operacao",
  },
  // 007 — Exception Management queue (view_all_trips: all 7 internal roles read) + per-customer SLA
  // rules admin (manage_commercial_data: Admin, Ops Manager).
  {
    key: "exceptions",
    href: "/exceptions",
    icon: "TriangleAlert",
    permission: "view_all_trips",
    grupo: "operacao",
  },
  {
    key: "slaRules",
    href: "/sla-rules",
    icon: "Gauge",
    permission: "manage_commercial_data",
    grupo: "operacao",
  },
  // 008 — Documents + Billing (view_all_trips: all 7 internal roles read) + Rates (edit_rates:
  // Admin, Finance).
  {
    key: "documents",
    href: "/documents",
    icon: "FileCheck",
    permission: "view_all_trips",
    grupo: "operacao",
  },
  {
    key: "billing",
    href: "/billing",
    icon: "Receipt",
    permission: "view_all_trips",
    grupo: "faturamento",
  },
  {
    key: "rates",
    href: "/billing/rates",
    icon: "Coins",
    permission: "edit_rates",
    grupo: "faturamento",
  },
  // 016 — Freight rate lookup / "Tabela de Fretes" (view_freight_rates: all 7 internal roles).
  // NOT named "Rotas": that label belongs to the Lanes screen below.
  {
    key: "freightRates",
    href: "/freight-rates",
    icon: "Table2",
    permission: "view_freight_rates",
    grupo: "faturamento",
  },
  // 009 — Reports (view_all_trips: all 7 internal roles, mirroring the 005 dashboard).
  {
    key: "reports",
    href: "/reports",
    icon: "BarChart3",
    permission: "view_all_trips",
    grupo: "analise",
  },
  // Status do Sistema (2026-08-19): o pulso dos robôs e do worker. Mesma chave do painel, e não uma
  // de administração — quem precisa saber que os números pararam de chegar é quem os usa.
  {
    key: "serverStatus",
    href: "/status",
    icon: "Activity",
    permission: "view_all_trips",
    grupo: "analise",
  },
  {
    key: "adminUsers",
    href: "/admin/users",
    icon: "Users",
    permission: "manage_users",
    grupo: "sistema",
  },
  {
    key: "adminAudit",
    href: "/admin/audit",
    icon: "ScrollText",
    permission: "view_audit_log",
    grupo: "sistema",
  },
  /**
   * Novidades (2026-08-25): o que mudou no TMS.
   *
   * SEM `permission`, ao contrário dos dois itens acima — é o único item de "Sistema" que todo mundo
   * enxerga. A tela não mostra dado nenhum do negócio: mostra o que o sistema passou a fazer, e quem
   * usa convive com as mudanças queira ou não. Restringi-la só garantiria que parte das pessoas
   * descobrisse cada mudança tropeçando nela.
   */
  { key: "novidades", href: "/novidades", icon: "Sparkles", grupo: "sistema" },
  // 002 — commercial master data (manage_commercial_data: Admin, Ops Manager).
  {
    key: "customers",
    href: "/admin/customers",
    icon: "Building2",
    permission: "manage_commercial_data",
    grupo: "cadastros",
  },
  {
    key: "locations",
    href: "/admin/locations",
    icon: "MapPinned",
    permission: "manage_commercial_data",
    grupo: "cadastros",
  },
  {
    key: "lanes",
    href: "/admin/lanes",
    icon: "Route",
    permission: "manage_commercial_data",
    grupo: "cadastros",
  },
  /**
   * Modelos de Pré-SM (2026-08-25, fatia 026): a correspondência entre as nossas rotas e os modelos
   * da gerenciadora Logae.
   *
   * Fica logo abaixo de Rotas porque é a mesma pergunta vista de outro lado — qual rota é qual —, e
   * quem confirma aqui é quem administra a malha lá. Mesma permissão pelo mesmo motivo.
   */
  {
    key: "preSmRotas",
    href: "/admin/pre-sm-rotas",
    icon: "ShieldCheck",
    permission: "manage_commercial_data",
    grupo: "cadastros",
  },
  /**
   * A conferência das correspondências ESTAÇÃO → CIDADE (2026-08-26, fatia 027).
   *
   * Irmã da de cima, e ao lado dela: o `setPreSM` pede o código IBGE das cidades de coleta e de
   * entrega, e a cidade sai do NOME da estação. Mesma permissão pelo mesmo motivo — é decisão de
   * cadastro, não de escala.
   */
  {
    key: "preSmCidades",
    href: "/admin/pre-sm-cidades",
    icon: "MapPin",
    permission: "manage_commercial_data",
    grupo: "cadastros",
  },
  // 008 — per-customer document-requirement checklists + the document-type master.
  {
    key: "documentRequirements",
    href: "/admin/document-requirements",
    icon: "ListChecks",
    permission: "manage_commercial_data",
    grupo: "cadastros",
  },
  // 004 — trip import (import_trips: Admin, Ops Manager, Dispatcher).
  {
    key: "imports",
    href: "/imports",
    icon: "Upload",
    permission: "import_trips",
    grupo: "importacao",
  },
  {
    key: "importHistory",
    href: "/imports/history",
    icon: "History",
    permission: "import_trips",
    grupo: "importacao",
  },
  // 002 — fleet master data (manage_fleet_data: Admin, Ops Manager, Fleet Coordinator).
  {
    key: "drivers",
    href: "/resources/drivers",
    icon: "IdCard",
    permission: "manage_fleet_data",
    grupo: "cadastros",
  },
  {
    key: "vehicles",
    href: "/resources/vehicles",
    icon: "Truck",
    permission: "manage_fleet_data",
    grupo: "cadastros",
  },
  {
    key: "trailers",
    href: "/resources/trailers",
    icon: "Container",
    permission: "manage_fleet_data",
    grupo: "cadastros",
  },
  {
    key: "carriers",
    href: "/resources/carriers",
    icon: "Handshake",
    permission: "manage_fleet_data",
    grupo: "cadastros",
  },
];
