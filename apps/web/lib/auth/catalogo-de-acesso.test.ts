import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS } from "@brazil-tms/shared";
import { NAV_ITEMS } from "@/lib/nav";
import {
  GRUPO_DAS_ACOES,
  ROTULO_DA_ACAO,
  montarCatalogo,
  permissoesDoCatalogo,
} from "./catalogo-de-acesso";

/**
 * TODA CAPACIDADE PRECISA APARECER NA TELA DE CARGOS — e este teste é o que cobra isso.
 *
 * ── O DEFEITO QUE ELE IMPEDE, E POR QUE ELE SERIA INVISÍVEL ───────────────────────────────────
 *
 * Alguém acrescenta uma `PermissionKey` numa fatia futura, o servidor passa a verificá-la, e
 * ninguém a coloca aqui. O desfecho: **nenhum cargo consegue concedê-la**. A tela que depende dela
 * fica inalcançável para todo mundo — e não há erro em lugar nenhum, porque o sistema está fazendo
 * exatamente o que mandaram.
 *
 * Quem descobre é a pessoa que não consegue trabalhar, dias depois, e ninguém liga o efeito à causa.
 *
 * É a mesma família de defeito de `programacao_prefs` (a gravação que descartava um campo) e do
 * journal da migração (a entrada que faltava): **uma ausência**. Ausência não tem tipo, e a única
 * forma de cobrá-la é um teste que conta.
 */
describe("o catálogo cobre TODAS as capacidades", () => {
  const doCatalogo = permissoesDoCatalogo();

  it("nenhuma capacidade fica de fora", () => {
    const faltando = ALL_PERMISSIONS.filter((p) => !doCatalogo.includes(p));
    expect({ faltando }).toEqual({ faltando: [] });
  });

  it("nenhuma aparece DUAS vezes — marcar em dois lugares é conceder por engano", () => {
    // Uma permissão em dois grupos daria duas caixas para a mesma coisa: desmarcar uma e não a
    // outra deixaria a tela dizendo "não" e o servidor dizendo "sim".
    const vistas = new Set<string>();
    const repetidas = doCatalogo.filter((p) => (vistas.has(p) ? true : (vistas.add(p), false)));
    expect({ repetidas }).toEqual({ repetidas: [] });
  });

  it("a conta fecha: páginas + ações = o catálogo inteiro", () => {
    expect(doCatalogo).toHaveLength(ALL_PERMISSIONS.length);
  });
});

describe("as duas metades do catálogo", () => {
  const catalogo = montarCatalogo();
  const acoes = catalogo.find((g) => g.chave === GRUPO_DAS_ACOES);
  const paginas = catalogo.filter((g) => g.chave !== GRUPO_DAS_ACOES);

  it("as páginas são DERIVADAS do menu, nunca redigitadas", () => {
    /**
     * É isto que faz a tela acompanhar sozinha: se um item de menu mudar de permissão, o catálogo
     * muda junto. Uma lista escrita à mão divergiria do menu em silêncio — a tela de cargos diria
     * que o cargo abre a Expedição, e o menu não a mostraria.
     */
    const doMenu = new Set(NAV_ITEMS.filter((i) => i.permission).map((i) => i.permission));
    const nasPaginas = new Set(paginas.flatMap((g) => g.itens.map((i) => i.permissao)));
    expect([...nasPaginas].sort()).toEqual([...doMenu].sort());
  });

  it("toda página listada existe no menu de verdade", () => {
    const chaves = new Set(NAV_ITEMS.map((i) => i.key));
    for (const g of paginas) {
      for (const item of g.itens) {
        expect(item.paginas.length).toBeGreaterThan(0);
        for (const p of item.paginas) expect(chaves.has(p)).toBe(true);
      }
    }
  });

  it("toda AÇÃO tem rótulo escrito à mão — sem ele a tela mostraria a chave crua", () => {
    // A ação não tem página de onde tirar o nome. Faltar o rótulo faria a tela oferecer
    // "mark_billing_ready" para alguém decidir, que é pedir uma decisão em outro idioma.
    for (const item of acoes?.itens ?? []) {
      expect(ROTULO_DA_ACAO[item.permissao]).toBeTruthy();
    }
  });

  it("as ações NÃO abrem página nenhuma — é isso que as define", () => {
    for (const item of acoes?.itens ?? []) expect(item.paginas).toEqual([]);
  });

  it("nenhum rótulo de ação sobra apontando para capacidade que não existe", () => {
    // O outro lado do envelhecimento: alguém remove uma capacidade e esquece o rótulo aqui.
    for (const chave of Object.keys(ROTULO_DA_ACAO)) {
      expect(ALL_PERMISSIONS as readonly string[]).toContain(chave);
    }
  });
});
