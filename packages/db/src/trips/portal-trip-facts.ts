import { eq } from "drizzle-orm";
import type { PortalTrip } from "@brazil-tms/shared";
import { db } from "../client";
import { spotOffers, trips } from "../../schema";
import { writeAudit } from "../audit/write-audit";
import { resolvePortalActorId } from "./portal-actor";

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
  // O ID NUMÉRICO do portal: a chave com que o TMS manda nele (aceitar/rejeitar). Ver
  // `PortalTrip.portalTripId`. Sem ele, cada clique custaria uma busca só para redescobrir um
  // número que a listagem já entregou.
  if (portal.portalTripId) fields["ID (portal)"] = portal.portalTripId;
  if (portal.driverLabel) fields["Motorista (portal)"] = portal.driverLabel;
  // O id do motorista no sistema do cliente. Guardado porque é a única chave que os dois lados
  // compartilham, e porque um dado que o cliente entrega de graça não se joga fora.
  if (portal.driverExternalId) fields["ID do motorista (portal)"] = portal.driverExternalId;
  if (portal.plateLabel) fields["Placa (portal)"] = portal.plateLabel;
  if (portal.operatorLabel) fields["Operador (portal)"] = portal.operatorLabel;
  /**
   * A DOCA DE SAÍDA — onde a viagem carregou (30/08, a pedido).
   *
   * Da ORIGEM, que é a primeira perna: é lá que se carrega, e foi lá que o portal a registrou nas
   * 39 viagens medidas — todas na parada de sequência 1, nenhuma exceção.
   *
   * ── ELA JÁ CHEGAVA HÁ MESES, E NINGUÉM LIA ───────────────────────────────────────────────
   *
   * O robô entrega a página crua da listagem, então `outbound_dock_infos` vinha em toda
   * atualização. Não custou chamada nova nem versão nova do userscript — custou alguém procurar.
   *
   * ── E POR ISSO ELA NÃO APARECE NO PLANEJADO ──────────────────────────────────────────────
   *
   * Medido em 30/08: Aceito 39 de 50 com doca, Planejado 0 de 50. A doca nasce quando a estação
   * encosta o veículo, não quando a viagem é programada — então uma viagem sem doca aqui não é
   * falha de leitura, é uma viagem que ainda não carregou. A tela precisa dizer isso calando: sem
   * doca, sem selo.
   */
  const doca = portal.legs[0]?.origin.docaSaida;
  if (doca) fields["Doca (portal)"] = doca;
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
   * O LEILÃO, que era lido e jogado fora (2026-08-29).
   *
   * O ciclo de spot olhava `bid_status` para decidir se avisava e descartava. Quando o usuário
   * perguntou "por que não avisou desse spot?", não deu para responder: zero viagens tinham o
   * campo guardado, e a viagem em questão já havia sido purgada com o dado dentro.
   *
   * Guardado aqui, no ciclo do PLANO, que é o que enxerga todas as viagens a cada cinco minutos
   * SEM filtro de janela. O ciclo de spot vê pela fresta de sessenta segundos; este vê tudo. Se um
   * leilão passar batido lá, ele aparece aqui — é a segunda linha de defesa que faltava.
   *
   * O rótulo é traduzido porque é o que a tela mostra; o código bruto vira parte dele quando for
   * desconhecido, pelo mesmo motivo do `Status (portal)`: aprender os que faltam a partir do dado
   * real, em vez de chamar tudo de "outro".
   */
  if (typeof portal.bidStatus === "number") {
    fields["Leilão (portal)"] =
      portal.bidStatus === 10
        ? "Aberto"
        : portal.bidStatus === 40
          ? "Encerrado"
          : portal.bidStatus === 0
            ? "Sem leilão"
            : `Leilão ${portal.bidStatus}`;
  }
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

  /**
   * O LEILÃO VIRA REGISTRO QUANDO ABRE — e diz se o aviso saiu (2026-08-29, a pedido).
   *
   * Só na TRANSIÇÃO para aberto: enquanto o leilão dura, o ciclo do plano passa por ele a cada
   * cinco minutos, e uma linha por passagem encheria a auditoria com o mesmo fato.
   *
   * ── POR QUE ELE GRAVA A ROTA, E NÃO ACUSA ─────────────────────────────────────────────────────
   *
   * A tentação era escrever "o aviso NÃO saiu" quando não há oferta registrada. Seria mentira na
   * maioria das vezes: a lista de rotas de interesse mora DENTRO do userscript (`ROTAS_PERMITIDAS`)
   * e filtra antes de mandar, então `spot_offers` só conhece as nossas ~30 rotas. Leilão de rota
   * alheia sem oferta é o filtro FUNCIONANDO — 659 viagens em 30 dias, decisão e não defeito.
   *
   * Duplicar a lista aqui para saber a diferença seria pior ainda: duas listas divergem em silêncio,
   * e a segunda passaria a acusar um erro que não existe.
   *
   * Então a linha grava o PAR DE ESTAÇÕES ao lado da oferta, e não conclui nada. Quem lê compara com
   * a lista do robô: rota nossa sem oferta é falha de verdade; rota alheia sem oferta é o esperado.
   * A pergunta de 29/08 — "por que não avisou desse spot?" — se responde com esses dois campos.
   *
   * Em 29/08 a pergunta "por que não avisou desse spot?" ficou sem resposta porque `bid_status` era
   * lido e descartado, e a viagem foi purgada com o dado dentro. Esta linha é a resposta que faltou.
   *
   * Falhar aqui NÃO desfaz a gravação dos fatos: a auditoria é registro, e perder uma linha dela é
   * ruim, mas perder a atualização da viagem por causa dela seria pior.
   */
  const virouLeilao =
    fields["Leilão (portal)"] === "Aberto" && existing?.["Leilão (portal)"] !== "Aberto";
  if (virouLeilao && portal.portalTripId) {
    try {
      const [jaAvisado] = await db
        .select({ id: spotOffers.id })
        .from(spotOffers)
        .where(eq(spotOffers.portalTripId, portal.portalTripId))
        .limit(1);
      await writeAudit(db, {
        /**
         * A conta de serviço do robô, a mesma que assina a varredura de retiradas.
         *
         * `audit_logs.actor_user_id` é `NOT NULL` com chave estrangeira para `users`: a tabela foi
         * desenhada para atos de GENTE. Um registro do robô continua precisando de um autor, e o
         * usuário de serviço é a resposta honesta — em vez de afrouxar a coluna para caber uma
         * exceção, que abriria a porta para auditoria sem dono.
         *
         * Resolvido aqui dentro, e não recebido por parâmetro: quem chama é o caminho de
         * importação, que roda sem sessão e não teria de onde tirar.
         */
        actorUserId: await resolvePortalActorId(),
        action: "trip.portal_auction_open",
        entityType: "trip",
        entityId: tripId,
        previousValue: null,
        newValue: {
          portalTripId: portal.portalTripId,
          externalTripId: portal.externalTripId,
          // Os dois campos com que se responde "por que não avisou desse spot?". Ver o bloco acima:
          // é a ROTA que diz se a ausência de oferta era esperada ou é falha.
          rota: `${portal.stops[0]?.stationName ?? "?"} -> ${portal.stops.at(-1)?.stationName ?? "?"}`,
          ofertaDeSpot: jaAvisado ? "registrada" : "nenhuma",
          preco: portal.priceCents ?? null,
        },
      });
    } catch {
      // Ver o bloco acima: registro perdido é ruim; viagem não atualizada é pior.
    }
  }

  return true;
}
