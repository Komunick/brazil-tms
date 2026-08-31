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
  /**
   * O item DEPENDE de outro — aparece recuado logo abaixo dele (2026-08-27, a pedido).
   *
   * O grupo já dava pontos de parada ao olho; o que ele não dizia é que "Minha Programação" é um
   * RECORTE da Torre de Controle, e que "Histórico de Importações" é a mesma tela de Importações
   * olhando para trás. Vinte e nove itens no mesmo nível fazem o olho tratar tudo como assunto
   * diferente, e a barra passou a rolar.
   *
   * ── RECUA, NÃO RECOLHE ──────────────────────────────────────────────────────────────────────
   *
   * Nada esconde e nada precisa de clique para abrir. A regra que o grupo já seguia continua
   * valendo inteira: todo item a um clique, sempre. O que muda é o desenho dizer o que a estrutura
   * sempre foi.
   *
   * Recolher reduziria a altura, e é a tentação óbvia — mas transformaria "achar" em "lembrar onde
   * estava guardado", que é o problema que os grupos existiam para resolver.
   *
   * ── FILHO ÓRFÃO SOBE ────────────────────────────────────────────────────────────────────────
   *
   * Se a permissão esconder o pai, o filho volta ao nível de cima em vez de sumir junto. Recuar sob
   * um item que não está na tela seria um recuo sem referência, e esconder um item que a pessoa PODE
   * ver por causa de um que ela não pode seria tirar acesso por efeito colateral.
   */
  pai?: string;
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
    // É a Torre de Controle filtrada pelo que ESTA pessoa acompanha — o exemplo que o usuário deu.
    pai: "trips",
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
  /**
   * A aba GR — a Pré-SM da viagem (2026-08-26, fatia 027).
   *
   * Fica logo depois da expedição porque é o passo seguinte dela: a viagem é atribuída ali e cai
   * aqui. Mesma chave (`assign_resources`) porque é a mesma pessoa — a Pré-SM nasce da atribuição
   * que ela acabou de fazer.
   *
   * É tela de OPERAÇÃO, não de administração: as duas telas de conferência de cadastro moram em
   * Cadastros, esta mora no dia a dia.
   */
  {
    key: "gr",
    href: "/gr",
    icon: "ShieldCheck",
    permission: "assign_resources",
    grupo: "operacao",
  },
  /**
   * A passagem de turno (2026-08-26) — o diário de cada setor.
   *
   * Fica no fim do bloco de operação porque é o que se abre no COMEÇO e no FIM do turno, não
   * durante ele. Permissão de LEITURA (`view_all_trips`, os sete papéis internos): quem escreve é
   * decidido pelo SETOR da conta, dentro da tela, e o servidor confere em toda escrita. Esconder o
   * item de quem não tem setor seria errado — ler o diário do turno anterior é justamente para
   * quem não escreveu nele.
   */
  {
    key: "passagemDeTurno",
    href: "/passagem-de-turno",
    icon: "ClipboardList",
    permission: "view_all_trips",
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
    /*
     * As regras são a CONFIGURAÇÃO das exceções: é delas que sai o que vira alerta na fila ao lado.
     * Quem abre uma para entender por que a outra disparou faz esse caminho o tempo todo — e a
     * permissão diferente (só quem administra dado comercial) já dizia que uma é o dia a dia e a
     * outra é o ajuste.
     */
    pai: "exceptions",
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
    // O que se cobra do cliente. O Faturamento é onde esse número vira dinheiro.
    pai: "billing",
  },
  // 016 — Freight rate lookup / "Tabela de Fretes" (view_freight_rates: all 7 internal roles).
  // NOT named "Rotas": that label belongs to the Lanes screen below.
  {
    key: "freightRates",
    href: "/freight-rates",
    icon: "Table2",
    permission: "view_freight_rates",
    grupo: "faturamento",
    // O que se paga ao agregado — o outro lado da mesma conta. Mesmo pai, de propósito.
    pai: "billing",
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
  /*
    CARGOS (2026-08-31, fatia 029) — logo acima de "Usuários e Perfis", porque é do cargo que o
    acesso de cada pessoa passa a sair. Quem vai mexer no que alguém alcança repara no cargo antes.

    Ele NÃO aparece na tela de cargos como página marcável, e isso é de propósito: quem administra
    usuários já o alcança por definição, e oferecer "ver a tela de cargos" como caixa separada
    permitiria um cargo que abre a tela e não consegue salvar nada nela.
  */
  {
    key: "cargos",
    href: "/admin/cargos",
    icon: "ShieldCheck",
    permission: "manage_users",
    grupo: "sistema",
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
  /**
   * A fila de pré-cadastros — o que o formulário público recebe (fatia 028).
   *
   * Em CADASTROS e não em operação: é conferência de cadastro de motorista, feita por quem cuida de
   * frota, e não trabalho do dia da viagem. Mesma chave do cadastro de motorista, porque é a mesma
   * pessoa — criar uma permissão nova para o mesmo grupo seria uma chave a mais para administrar.
   */
  {
    key: "preCadastros",
    href: "/pre-cadastros",
    icon: "UserPlus",
    permission: "manage_fleet_data",
    grupo: "cadastros",
  },
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
    pai: "imports",
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

/**
 * A ORDEM DE UM GRUPO: cada pai seguido dos seus filhos (2026-08-27).
 *
 * `NAV_ITEMS` continua sendo a fonte da ordem — isto só puxa cada filho para logo abaixo do pai,
 * em vez de exigir que quem edita a lista mantenha os dois juntos à mão. Um filho declarado longe
 * do pai é um filho que alguém separa sem perceber, e o recuo passaria a apontar para o item errado.
 *
 * ── FILHO ÓRFÃO SOBE, EM VEZ DE SUMIR ─────────────────────────────────────────────────────────
 *
 * Se a permissão escondeu o pai, o filho aparece no nível de cima. É a regra que evita o pior caso:
 * esconder uma tela que a pessoa PODE ver por efeito colateral de outra que ela não pode.
 *
 * Acontece de verdade — `slaRules` pede `manage_commercial_data` e `exceptions` pede
 * `view_all_trips`, então há papéis com o filho e sem o pai, e outros com o pai e sem o filho.
 */
export function ordenarComFilhos(
  doGrupo: readonly NavItem[],
  chavesVisiveis: ReadonlySet<string>,
): NavItem[] {
  return doGrupo.flatMap((item) => {
    // Já vai sair recuado sob o pai — não pode sair duas vezes.
    if (item.pai && chavesVisiveis.has(item.pai)) return [];
    return [item, ...doGrupo.filter((f) => f.pai === item.key)];
  });
}
