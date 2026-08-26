/**
 * O CADASTRO DE MOTORISTAS DO PORTAL, lido do jeito que ele entrega (2026-08-23, a pedido).
 *
 * ── DUAS CHAMADAS, PORQUE O PORTAL MASCARA ────────────────────────────────────────────────────
 *
 * A listagem (`/api/driverservice/agency/br/driver/list`) devolve TUDO menos o que é pessoal:
 * `driver_name`, `phone` e `national_id` voltam vazios. Medido: 24 de 24 registros com validade de
 * CNH e id preenchidos, 0 de 24 com nome ou telefone.
 *
 * O que falta sai de uma segunda rota, UM CAMPO POR CHAMADA:
 *
 *   GET /api/driverservice/agency/driver/sensitive/data?driver_id=<id>&data_field=phone
 *     → { retcode: 0, data: { data_detail: "<valor>" } }
 *
 * É por isso que o robô pergunta ao TMS de quem falta o quê antes de revelar: revelar os 1.391 seria
 * ~2.800 chamadas registradas no log do fornecedor, e a maioria para reescrever o que já temos.
 *
 * ── O QUE ESTE MÓDULO ACEITA GUARDAR ──────────────────────────────────────────────────────────
 *
 * Menos do que chega. O payload traz conta bancária, conta Shopee Pay e chave de pagamento; nada
 * disso serve ao TMS, e guardar dado bancário num segundo sistema é responsabilidade sem uso. Aqui
 * só passa o que a operação usa: identidade, contato, habilitação e situação.
 *
 * O CPF ENTRA (2026-08-23, a pedido, depois de ter ficado de fora). É o documento que identifica a
 * pessoa sem depender do nome escrito certo, e a operação precisa dele. `national_id` é o nome do
 * campo no portal; que ele seja também um `data_field` revelável é a suposição que a primeira
 * rodada confirma — e ela falha do jeito certo: sem resposta, o campo simplesmente não é gravado.
 */

/** Um motorista como o portal o descreve, já reduzido ao que o TMS guarda. */
export interface PortalDriver {
  /** O id no portal — a chave que os dois cadastros compartilham. */
  portalDriverId: string;
  /** Vazio na listagem; preenchido quando a revelação traz. */
  name: string | null;
  phone: string | null;
  licenseNumber: string | null;
  /** O CPF, quando revelado. Nulo é o normal antes da revelação. */
  cpf: string | null;
  /** "E", "AE", "AD"… — a categoria, que a listagem entrega sem mascarar. */
  licenseCategory: string | null;
  /** `YYYY-MM-DD`, ou `null` quando o portal manda 0 (o "não tem" dele). */
  licenseExpiry: string | null;
  /** O vocabulário do portal: 1 ativo, o resto é alguma forma de inativo. Ver `ativoNoPortal`. */
  status: number | null;
  plate: string | null;
  /**
   * O REGISTRO INTEIRO como o portal mandou (2026-08-23, a pedido: "quero todos os dados").
   *
   * Endereço, nascimento, RENAVAM, fabricante e ano do veículo, dono, estações, taxas — uns
   * cinquenta campos que o TMS não tem coluna para guardar e que ninguém filtra. Vai inteiro para
   * `drivers.portal_fields`, do mesmo jeito que a viagem guarda o que a planilha traz a mais.
   *
   * Guardado SEM TRADUÇÃO, com os nomes do fornecedor: no dia em que ele renomear um campo, a
   * diferença aparece aqui em vez de sumir num mapeamento nosso.
   */
  bruto: Record<string, unknown>;
}

/**
 * Os campos que a revelação sabe entregar, no nome que o PORTAL usa.
 *
 * ── O CPF MUDOU DE NOME, E CUSTOU QUATRO DIAS (2026-08-26) ────────────────────────────────────
 *
 * Era `national_id`, e funcionou até 22/08. Em 23/08 o portal passou a responder
 * `retcode 271601065 — "You do not have permission to view this sensitive data"` para esse campo, e
 * SÓ para ele: nome e telefone continuaram vindo normalmente.
 *
 * A mensagem parecia revogação de permissão da conta, e não era. A tela do portal continua
 * revelando o CPF pelo olho da lista — conferido na aba Network em 26/08, a chamada que devolve
 * 200 é `data?data_field=cpf&driver_id=…`. O que mudou foi o nome do campo.
 *
 * ── O QUE ISSO CUSTOU ────────────────────────────────────────────────────────────────────────
 *
 * Medido em produção em 26/08: dos 1.449 motoristas, só 400 têm CPF — e desde 23/08 **todo
 * motorista novo entra sem**. Foram 71 em quatro dias, 21 só no dia 26. E CPF é campo obrigatório
 * do `setPreSM`: cada um desses é uma viagem que a aba GR bloqueia.
 *
 * ── `national_id` FICA NA LISTA, e é de propósito ────────────────────────────────────────────
 *
 * O robô pode entregar uma revelação que já tinha pedido antes da correção. O dado é o mesmo, e
 * recusá-lo por causa do rótulo jogaria fora um CPF que chegou. Ele só não é mais PEDIDO.
 */
export const CAMPOS_REVELAVEIS = ["driver_name", "phone", "cpf", "national_id"] as const;
export type CampoRevelavel = (typeof CAMPOS_REVELAVEIS)[number];

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  return s === "" || s === "0" ? null : s;
};

/**
 * A data que o portal manda como segundos, ou como texto, ou como zero.
 *
 * Zero é o "não tem" dele — o mesmo padrão dos marcos de viagem, onde o não-atingido volta 0 e não
 * nulo. Tratar zero como data daria 01/01/1970 em cima de 1.391 motoristas.
 */
function dataDoPortal(v: unknown): string | null {
  if (typeof v === "number" && v > 0) return new Date(v * 1000).toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

/** Uma página da listagem → os motoristas que ela descreve. */
export function mapPortalDrivers(payload: unknown): PortalDriver[] {
  const dados = (payload as { data?: { list?: unknown[] } } | null)?.data;
  const lista = Array.isArray(dados?.list) ? dados.list : [];
  const saida: PortalDriver[] = [];

  for (const cru of lista) {
    const d = (cru ?? {}) as Record<string, unknown>;
    const id = texto(d.driver_id) ?? texto(d.id);
    // Sem id não há como casar nem como voltar depois para revelar: a linha não serve para nada.
    if (!id) continue;
    saida.push({
      portalDriverId: id,
      name: texto(d.driver_name),
      phone: texto(d.phone),
      cpf: texto(d.national_id),
      licenseNumber: texto(d.license_number),
      licenseCategory: texto(d.license_type),
      licenseExpiry: dataDoPortal(d.license_expire_date),
      status: typeof d.status === "number" ? d.status : null,
      plate: texto(d.vehicle_number),
      bruto: d,
    });
  }
  return saida;
}

/** O que uma revelação devolve — um valor só, do campo que foi pedido. */
export function valorRevelado(payload: unknown): string | null {
  const d = (payload as { data?: { data_detail?: unknown } } | null)?.data;
  return texto(d?.data_detail);
}
