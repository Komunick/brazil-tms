import { eq } from "drizzle-orm";
import type { PortalTrip } from "@brazil-tms/shared";
import { db } from "../client";
import { trips } from "../../schema";

/**
 * O que o CLIENTE diz sobre esta viagem, gravado onde cada coisa pertence (2026-08-16).
 *
 * Motorista, placa e operador são as PALAVRAS do cliente, não uma atribuição do TMS: ficam em
 * `customer_fields` (exibição), do mesmo jeito que as colunas extras da planilha. Casá-las com a
 * frota cadastrada é outra história, mais difícil, e mora em `portal-fleet-link`.
 *
 * O preço vai em COLUNA própria, em centavos: é dele que o faturamento tira a base, e dinheiro não
 * mora em campo de texto de exibição.
 *
 * Vive num módulo próprio porque os DOIS caminhos precisam dele. Isto começou dentro do plano, e o
 * resultado foi que uma viagem já em curso — que sai do Planejado assim que aceita — nunca ganhava
 * motorista nem placa: no portal ela está viva na aba "Aceito", e o TMS só a reencontrava depois de
 * terminada. Eram 73 viagens invisíveis a qualquer momento.
 *
 * Devolve se algo mudou de fato, para um ciclo que só reescreve o mesmo continuar sendo silencioso.
 */
export async function writePortalFacts(
  tripId: string,
  portal: PortalTrip,
  currentFields?: unknown,
  currentPriceCents?: number | null,
): Promise<boolean> {
  const priceChanged = portal.priceCents != null && portal.priceCents !== currentPriceCents;
  if (priceChanged) {
    await db
      .update(trips)
      .set({ customerPriceCents: portal.priceCents, updatedAt: new Date() })
      .where(eq(trips.id, tripId));
  }

  const fields: Record<string, string> = {};
  if (portal.driverLabel) fields["Motorista (portal)"] = portal.driverLabel;
  // O id do motorista no sistema do cliente. Guardado porque é a única chave que os dois lados
  // compartilham, e porque um dado que o cliente entrega de graça não se joga fora.
  if (portal.driverExternalId) fields["ID do motorista (portal)"] = portal.driverExternalId;
  if (portal.plateLabel) fields["Placa (portal)"] = portal.plateLabel;
  if (portal.operatorLabel) fields["Operador (portal)"] = portal.operatorLabel;
  /**
   * O que o PORTAL chama esta viagem, gravado como está (2026-08-17).
   *
   * O status do portal era lido, usado para decidir cancelar/concluir, e jogado fora. Duas
   * consequências: ninguém conseguia conferir na tela por que o TMS achou o que achou, e o
   * vocabulário do cliente — Assigning, Arrived, Operating, Seal, Unseal, Departed, Unloaded — ficava
   * invisível para nós, que só conhecemos quatro códigos por medição e chamamos o resto de
   * "Status 40". Guardar o rótulo é o que permite aprender os que faltam a partir do dado real, em
   * vez de adivinhar.
   */
  if (portal.status) fields["Status (portal)"] = portal.status;
  /**
   * O eixo da ACEITAÇÃO, que é onde a operação decide (2026-08-17).
   *
   * "Pending" quer dizer que a viagem chegou e alguém precisa aceitar ou rejeitar a proposta.
   * "Accepted" com a viagem ainda sem motorista quer dizer que ela está esperando atribuição — 359
   * assim no portal hoje, todas amontoadas em "Recebida" no TMS, indistinguíveis das 44 que ainda
   * nem foram aceitas.
   */
  if (portal.acceptanceStatus) fields["Aceitação (portal)"] = portal.acceptanceStatus;
  if (Object.keys(fields).length === 0) return priceChanged;

  // Preserva o que a viagem já carrega (uma coluna da planilha, o operador de atribuição vindo do
  // detalhe) e sobrescreve só o que o portal de fato afirma.
  const existing = (currentFields ?? null) as Record<string, string> | null;
  const merged = { ...(existing ?? {}), ...fields };
  const same =
    existing != null &&
    Object.keys(merged).length === Object.keys(existing).length &&
    Object.entries(merged).every(([k, v]) => existing[k] === v);
  // Um preço novo conta como mudança mesmo quando motorista e placa continuam iguais — senão o ciclo
  // reportaria "sem mudança" logo depois de gravar dinheiro.
  if (same) return priceChanged;

  await db
    .update(trips)
    .set({ customerFields: merged, updatedAt: new Date() })
    .where(eq(trips.id, tripId));
  return true;
}
