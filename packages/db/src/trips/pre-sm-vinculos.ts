import { and, eq, inArray } from "drizzle-orm";
import { db } from "../client";
import { drivers, trailers, vehicles } from "../../schema";

/**
 * GRAVAR O VÍNCULO QUE QUEM ATRIBUI ESCOLHEU (2026-08-25, fatia 026).
 *
 * A gerenciadora Logae exige, em toda solicitação de monitoramento, dizer o que é cada veículo,
 * carreta e motorista: frota própria, agregado ou terceiro. O nosso cadastro distinguia só "nosso"
 * de "de fora", então 1.246 veículos e 405 motoristas estão como `subcontracted` — que aqui
 * significa **ainda não classificado**.
 *
 * A classificação acontece pelo uso: quem atribui responde uma vez por recurso, e da próxima ele
 * já vem preenchido. Foi decisão explícita não fazer mutirão de cadastro.
 *
 * ── SÓ PREENCHE O QUE ESTÁ VAZIO ──────────────────────────────────────────────────────────────
 *
 * O `where` exige `subcontracted`. Não é otimização: é para uma atribuição não SOBRESCREVER em
 * silêncio uma classificação que alguém já conferiu. Trocar o vínculo de um veículo já classificado
 * é operação de cadastro, feita na tela do veículo, com o histórico que ela tem — não efeito
 * colateral de escalar uma viagem.
 *
 * ── E NUNCA DERRUBA A ATRIBUIÇÃO ──────────────────────────────────────────────────────────────
 *
 * Cada gravação é independente e o erro é engolido de propósito. A atribuição no portal já foi
 * enfileirada quando isto roda; falhar aqui e devolver erro faria a tela dizer "não deu" sobre uma
 * ordem que JÁ foi pedida — e a pessoa tentaria de novo, gerando a segunda.
 *
 * O preço é um vínculo que fica sem gravar e ninguém percebe. É aceitável porque a consequência é
 * conhecida e visível: a viagem não gera Pré-SM, e a tela diz que falta a classificação (FR-013).
 */

export type VinculoEscolhido = "owned" | "agregado" | "terceiro";

export interface VinculosDaAtribuicao {
  /** Na MESMA ordem de `plates`: a primeira é o cavalo, as seguintes são carretas. */
  placas?: (VinculoEscolhido | null)[];
  motorista?: VinculoEscolhido | null;
  segundoMotorista?: VinculoEscolhido | null;
}

export async function gravarVinculosDaAtribuicao(entrada: {
  placas: string[];
  vinculos: VinculosDaAtribuicao | undefined;
  /** Ids do motorista NO PORTAL — é por eles que se acha o nosso cadastro. */
  portalDriverIds: (number | null | undefined)[];
}): Promise<{ gravados: number }> {
  const v = entrada.vinculos;
  if (!v) return { gravados: 0 };

  let gravados = 0;

  for (const [i, placa] of entrada.placas.entries()) {
    const escolha = v.placas?.[i];
    if (!escolha || !placa) continue;
    gravados += await gravarPlaca(placa, escolha);
  }

  const motoristas = [v.motorista, v.segundoMotorista];
  for (const [i, escolha] of motoristas.entries()) {
    const portalId = entrada.portalDriverIds[i];
    if (!escolha || portalId == null) continue;
    gravados += await gravarMotorista(portalId, escolha);
  }

  return { gravados };
}

/**
 * A placa pode ser cavalo OU carreta, e o TMS as guarda em tabelas diferentes.
 *
 * Tenta as duas. Uma placa que não existe em nenhuma não é erro: o portal aceita placas que o nosso
 * cadastro ainda não conhece, e recusar a atribuição por isso seria inventar uma regra que o cliente
 * não tem.
 */
async function gravarPlaca(placa: string, vinculo: VinculoEscolhido): Promise<number> {
  const alvo = placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!alvo) return 0;

  try {
    const v = await db
      .update(vehicles)
      .set({ ownershipType: vinculo, updatedAt: new Date() })
      .where(and(eq(vehicles.plate, alvo), eq(vehicles.ownershipType, "subcontracted")))
      .returning({ id: vehicles.id });
    if (v.length > 0) return v.length;

    const c = await db
      .update(trailers)
      .set({ ownershipType: vinculo, updatedAt: new Date() })
      .where(and(eq(trailers.plate, alvo), eq(trailers.ownershipType, "subcontracted")))
      .returning({ id: trailers.id });
    return c.length;
  } catch {
    // Ver o comentário do topo: a ordem já foi enfileirada, e devolver erro daqui faria a pessoa
    // tentar de novo.
    return 0;
  }
}

async function gravarMotorista(portalDriverId: number, vinculo: VinculoEscolhido): Promise<number> {
  try {
    const r = await db
      .update(drivers)
      .set({ ownershipType: vinculo, updatedAt: new Date() })
      .where(
        and(
          eq(drivers.portalDriverId, String(portalDriverId)),
          eq(drivers.ownershipType, "subcontracted"),
        ),
      )
      .returning({ id: drivers.id });
    return r.length;
  } catch {
    return 0;
  }
}

/**
 * O QUE JÁ ESTÁ CLASSIFICADO, para a tela não perguntar de novo (FR-010).
 *
 * Devolve por placa, olhando as duas tabelas. `null` significa "ainda não classificado" — o que a
 * tela mostra como campo vazio, e não como erro.
 */
export async function vinculosPorPlaca(
  placas: string[],
): Promise<Record<string, VinculoEscolhido | null>> {
  const alvos = placas.map((p) => p.toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
  if (alvos.length === 0) return {};

  const [vs, cs] = await Promise.all([
    db
      .select({ plate: vehicles.plate, tipo: vehicles.ownershipType })
      .from(vehicles)
      .where(inArray(vehicles.plate, alvos)),
    db
      .select({ plate: trailers.plate, tipo: trailers.ownershipType })
      .from(trailers)
      .where(inArray(trailers.plate, alvos)),
  ]);

  const saida: Record<string, VinculoEscolhido | null> = {};
  for (const linha of [...vs, ...cs]) {
    saida[linha.plate] = linha.tipo === "subcontracted" ? null : (linha.tipo as VinculoEscolhido);
  }
  return saida;
}
