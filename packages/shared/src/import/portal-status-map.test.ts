import { describe, expect, it } from "vitest";
import { portalStatusAgrees, TMS_STATUSES_FOR_PORTAL } from "./portal-status-map";
import { TRIP_STATUSES } from "../domain/trip-status";

/**
 * As duas regras que o usuário enunciou em 2026-08-19, palavra por palavra:
 *
 *   "UNSEAL — quando ele chega no destino mas ainda está descarregando. Então todos que tiverem
 *    status UNSEAL no portal têm que estar no filtro Descarregando no TMS."
 *
 *   "DEPARTED — quando o motorista partiu. Então o que estiver com esse status, o motorista está
 *    com o filtro aqui no TMS EM TRANSITO."
 *
 * Elas já valiam quando foram ditas (44 e 4 viagens em produção, sem exceção), porque o TMS deriva o
 * status dos horários reais e não do rótulo. Estes casos existem para que continuem valendo.
 */
describe("portalStatusAgrees — as regras enunciadas", () => {
  it("Departed está EM TRÂNSITO, e em mais nada", () => {
    expect(portalStatusAgrees("Departed", "in_transit")).toBe(true);
    expect(portalStatusAgrees("Departed", "at_origin")).toBe(false);
    expect(portalStatusAgrees("Departed", "loading")).toBe(false);
    expect(portalStatusAgrees("Departed", "completed")).toBe(false);
  });

  it("Unseal está DESCARREGANDO, e em mais nada", () => {
    expect(portalStatusAgrees("Unseal", "unloading")).toBe(true);
    // O caso que a regra nomeia: chegou no destino MAS ainda descarrega. Parar em `at_destination`
    // é justamente o defeito — a viagem some do fluxo e fica gerando alerta semanas depois.
    expect(portalStatusAgrees("Unseal", "at_destination")).toBe(false);
    expect(portalStatusAgrees("Unseal", "unloaded")).toBe(false);
  });
});

describe("portalStatusAgrees — o resto do vocabulário", () => {
  it("Arrived aceita as DUAS pontas, porque a parada depende da perna", () => {
    expect(portalStatusAgrees("Arrived", "at_origin")).toBe(true);
    expect(portalStatusAgrees("Arrived", "at_destination")).toBe(true);
    expect(portalStatusAgrees("Arrived", "in_transit")).toBe(false);
  });

  it("Assigned aceita `received`, que é a atribuição ainda não espelhada", () => {
    // Não é divergência de status: é atribuição pendente, contada à parte porque pede outra ação.
    expect(portalStatusAgrees("Assigned", "received")).toBe(true);
    expect(portalStatusAgrees("Assigned", "assigned")).toBe(true);
    expect(portalStatusAgrees("Assigned", "in_transit")).toBe(false);
  });

  it("Completed segue valendo depois que a viagem entra no faturamento", () => {
    // Faturar não desfaz ter concluído. Sem isto, 48 viagens apareceriam como divergentes hoje.
    for (const s of ["completed", "billing_pending", "billing_ready", "billed"] as const) {
      expect(portalStatusAgrees("Completed", s)).toBe(true);
    }
    expect(portalStatusAgrees("Completed", "in_transit")).toBe(false);
  });

  it("Operating cai em Descarregando, igual ao Unseal", () => {
    // O portal usa os dois rótulos para a mesma coisa; quebrar o lacre já inicia a descarga.
    expect(portalStatusAgrees("Operating", "unloading")).toBe(true);
  });
});

describe("portalStatusAgrees — o que NÃO pode virar alarme", () => {
  it("rótulo desconhecido nunca é divergência", () => {
    /**
     * O portal ganha status novo sem avisar — em 2026-08-18 apareceu `Accepted(Pending Award)` no
     * filtro de aceitação, que ninguém tinha visto. Acusar o que a gente ainda não aprendeu
     * transformaria a tela num alarme que se ignora, e alarme ignorado é pior que nenhum.
     */
    expect(portalStatusAgrees("Rotulo Que Ainda Nao Existe", "in_transit")).toBe(true);
  });

  it("viagem sem rótulo do portal nunca é divergência", () => {
    // Viagem digitada à mão nunca veio do portal: não há o que comparar.
    expect(portalStatusAgrees(null, "received")).toBe(true);
    expect(portalStatusAgrees(undefined, "received")).toBe(true);
    expect(portalStatusAgrees("", "received")).toBe(true);
  });
});

describe("TMS_STATUSES_FOR_PORTAL", () => {
  it("todo status citado existe de verdade na máquina de estados", () => {
    // Um erro de digitação aqui viraria divergência permanente e inexplicável na tela.
    for (const [rotulo, esperados] of Object.entries(TMS_STATUSES_FOR_PORTAL)) {
      for (const s of esperados) {
        expect(TRIP_STATUSES, `${rotulo} → ${s}`).toContain(s);
      }
    }
  });

  it("cobre os 11 rótulos lidos do próprio portal", () => {
    // Medidos no filtro "Status da viagem" das três abas em 2026-08-18.
    for (const r of [
      "Assigning",
      "Assigned",
      "Loading",
      "Seal",
      "Departed",
      "Arrived",
      "Unseal",
      "Operating",
      "Unloaded",
      "Completed",
      "Cancelled",
    ]) {
      expect(Object.keys(TMS_STATUSES_FOR_PORTAL)).toContain(r);
    }
  });
});
