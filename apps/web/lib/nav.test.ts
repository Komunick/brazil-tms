import { describe, expect, it } from "vitest";
import { NAV_ITEMS, ordenarComFilhos, type NavItem } from "./nav";

const chaves = (itens: NavItem[]) => itens.map((i) => i.key);
const visiveis = (itens: NavItem[]) => new Set(itens.map((i) => i.key));

const pai = (key: string): NavItem => ({ key, href: `/${key}`, icon: "X", grupo: "operacao" });
const filho = (key: string, de: string): NavItem => ({ ...pai(key), pai: de });

describe("a ordem de um grupo com filhos", () => {
  it("põe o filho logo abaixo do pai, mesmo declarado longe", () => {
    const itens = [pai("a"), pai("b"), filho("a2", "a")];
    expect(chaves(ordenarComFilhos(itens, visiveis(itens)))).toEqual(["a", "a2", "b"]);
  });

  it("não repete o filho no nível de cima", () => {
    const itens = [pai("a"), filho("a2", "a")];
    const saida = ordenarComFilhos(itens, visiveis(itens));
    expect(saida.filter((i) => i.key === "a2")).toHaveLength(1);
  });

  /**
   * O CASO QUE IMPORTA, e acontece de verdade: `slaRules` pede `manage_commercial_data` e
   * `exceptions` pede `view_all_trips`. Há papel com o filho e sem o pai.
   *
   * Sumir junto tiraria acesso a uma tela que a pessoa PODE ver, por causa de outra que ela não
   * pode — e o sintoma seria "a Regras de SLA desapareceu do menu", sem ninguém ligar à permissão
   * de outro item.
   */
  it("filho órfão sobe para o nível de cima", () => {
    const itens = [pai("b"), filho("a2", "a")]; // o pai "a" não está visível
    expect(chaves(ordenarComFilhos(itens, visiveis(itens)))).toEqual(["b", "a2"]);
  });

  it("pai sem filhos visíveis sai sozinho", () => {
    const itens = [pai("a")];
    expect(chaves(ordenarComFilhos(itens, visiveis(itens)))).toEqual(["a"]);
  });

  it("grupo vazio devolve vazio", () => {
    expect(ordenarComFilhos([], new Set())).toEqual([]);
  });

  /** Vários filhos mantêm a ordem em que foram declarados — não se inventa ordenação. */
  it("preserva a ordem entre irmãos", () => {
    const itens = [pai("a"), filho("a1", "a"), filho("a2", "a")];
    expect(chaves(ordenarComFilhos(itens, visiveis(itens)))).toEqual(["a", "a1", "a2"]);
  });
});

describe("o catálogo do menu", () => {
  /**
   * Um `pai` que não existe deixaria o item órfão para sempre — recuado por nada, ou (pior) tratado
   * como raiz sem que ninguém entenda por quê. É erro de digitação, e é invisível na tela.
   */
  it("todo `pai` aponta para um item que existe", () => {
    const chavesDoMenu = new Set(NAV_ITEMS.map((i) => i.key));
    for (const item of NAV_ITEMS) {
      if (item.pai) expect(chavesDoMenu.has(item.pai), `${item.key} → ${item.pai}`).toBe(true);
    }
  });

  /** Pai e filho no mesmo grupo: o recuo só faz sentido embaixo de algo que está ali. */
  it("pai e filho moram no mesmo grupo", () => {
    const porChave = new Map(NAV_ITEMS.map((i) => [i.key, i]));
    for (const item of NAV_ITEMS) {
      if (!item.pai) continue;
      expect(porChave.get(item.pai)?.grupo, item.key).toBe(item.grupo);
    }
  });

  /** Um nível só. Neto recuaria duas vezes numa barra que tem 12rem de largura. */
  it("nenhum filho é pai de outro", () => {
    const paisUsados = new Set(NAV_ITEMS.filter((i) => i.pai).map((i) => i.pai));
    for (const item of NAV_ITEMS) {
      if (item.pai && paisUsados.has(item.key)) {
        throw new Error(`${item.key} é filho e pai ao mesmo tempo`);
      }
    }
  });
});
