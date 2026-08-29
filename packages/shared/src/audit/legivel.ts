/**
 * A AUDITORIA EM PORTUGUÊS (2026-08-29, a pedido).
 *
 * As colunas "antes" e "depois" despejavam `JSON.stringify` dentro de uma célula com `truncate`. O
 * que a operação via era isto:
 *
 *     {"hops":["confirmed","at_origin"],"current_s
 *
 * Cortado no meio de uma chave, em inglês, com nome de campo de banco. Uma tela de auditoria que
 * ninguém consegue ler não é auditoria — é um arquivo morto que dá a impressão de prestar contas.
 *
 * Aqui o objeto vira uma lista de pares "rótulo: valor", já traduzidos. Quem chama desenha.
 *
 * ── O QUE NÃO SE FAZ AQUI ──────────────────────────────────────────────────────────────────────
 *
 * Não se ESCONDE campo desconhecido. Um campo que este arquivo não conhece aparece com o nome cru,
 * porque sumir com ele é pior: a auditoria passaria a mentir por omissão no dia em que alguém
 * gravasse algo novo e esquecesse de traduzir. O rótulo bruto é feio e honesto.
 *
 * E o JSON original continua acessível para quem precisa do dado exato — ver o `title` na tela.
 */

/** Um par pronto para desenhar. `valor` já vem em texto. */
export type LinhaLegivel = { rotulo: string; valor: string };

/**
 * Os campos que aparecem de verdade nos registros, com o nome que a operação usa.
 *
 * Ordem importa: é a ordem em que as linhas são desenhadas. Os campos que respondem "o que
 * aconteceu?" vêm antes dos que respondem "com quais números?".
 */
const ROTULOS: Record<string, string> = {
  // O ciclo de vida da viagem
  //
  // `desfecho` e `conferencia` abrem a lista de propósito: são o que responde "deu certo?". O
  // cronômetro e os ids vêm depois — importam quando algo deu errado, não antes disso.
  desfecho: "Desfecho",
  conferencia: "Conferência",
  current_status: "Status",
  currentStatus: "Status",
  hops: "Passos",
  from: "De",
  to: "Para",
  // A ação no portal
  externalTripId: "LH",
  portalTripId: "Id no portal",
  placasEnviadas: "Placas enviadas",
  plates: "Placas",
  platesInternas: "Placas só no TMS",
  driverId: "Motorista (id do portal)",
  secondDriverId: "2º motorista",
  reasonId: "Motivo",
  remark: "Observação",
  tentativa: "Tentativa",
  segundos: "Tempo",
  commandId: "Ordem",
  respostaDoPortal: "Resposta do portal",
  releituraDoPortal: "Releitura do portal",
  erro: "Erro",
  // A varredura de retiradas
  horasSemAparecer: "Horas sem aparecer no portal",
  portalLastSeenAt: "Visto no portal em",
  customerId: "Cliente",
  // Conferência
  confirmado: "Confirmado",
  motivo: "Motivo",
  detalhe: "Detalhe",
  placasConferidas: "Placas conferidas",
  retcode: "Código do portal",
  message: "Mensagem",
};

/** `assigned` → `Atribuída`. Quem passa o dicionário é a tela, que tem o i18n. */
export type Dicionarios = {
  /** Status de viagem: `assigned` → "Atribuída". */
  status?: (chave: string) => string | null;
};

function ehStatus(chave: string): boolean {
  return chave === "current_status" || chave === "currentStatus" || chave === "hops";
}

function valorEmTexto(chave: string, valor: unknown, dic: Dicionarios): string {
  if (valor == null) return "—";
  if (typeof valor === "boolean") return valor ? "sim" : "não";

  if (Array.isArray(valor)) {
    const partes = valor.map((v) => valorEmTexto(chave, v, dic));
    // `hops` é uma SEQUÊNCIA — a viagem passou por confirmada, depois por na-origem. A seta diz
    // isso; a vírgula faria ler como um conjunto sem ordem.
    return partes.join(chave === "hops" ? " → " : ", ");
  }

  if (typeof valor === "object") {
    // Objeto aninhado (a conferência, a resposta do portal) vira "a: x · b: y" numa linha só.
    const dentro = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${ROTULOS[k] ?? k}: ${valorEmTexto(k, v, dic)}`);
    return dentro.length > 0 ? dentro.join(" · ") : "—";
  }

  const texto = String(valor);
  if (texto === "") return "—";
  if (ehStatus(chave)) return dic.status?.(texto) ?? texto;
  // Uma string de placas separada por vírgula fica mais legível com espaço depois da vírgula.
  if (chave === "plates" || chave === "placasEnviadas" || chave === "platesInternas") {
    return texto.split(",").filter(Boolean).join(", ");
  }
  if (chave === "segundos") return `${texto}s`;
  return texto;
}

/**
 * O objeto gravado vira linhas legíveis, na ordem de `ROTULOS`.
 *
 * Campos que não estão no dicionário vêm DEPOIS, com o nome cru — visíveis, e sinalizando que
 * alguém gravou algo novo sem traduzir.
 */
export function linhasDaAuditoria(
  valor: Record<string, unknown> | null,
  dic: Dicionarios = {},
): LinhaLegivel[] {
  if (valor == null) return [];
  const chaves = Object.keys(valor).filter((k) => valor[k] !== undefined);
  const conhecidas = Object.keys(ROTULOS);
  const ordenadas = [
    ...conhecidas.filter((k) => chaves.includes(k)),
    ...chaves.filter((k) => !conhecidas.includes(k)),
  ];
  return ordenadas.map((k) => ({
    rotulo: ROTULOS[k] ?? k,
    valor: valorEmTexto(k, valor[k], dic),
  }));
}
