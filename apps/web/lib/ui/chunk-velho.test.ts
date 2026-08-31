import { beforeEach, describe, expect, it, vi } from "vitest";
import { deveRecarregar, ehChunkVelho, esquecerRecarga } from "./chunk-velho";

/**
 * O CHUNK VELHO (31/08) — o erro que todo deploy produz.
 *
 * Os nomes dos arquivos JS carregam um hash do conteúdo, então um deploy os troca. Quem estava com
 * a página aberta pede um arquivo que não existe mais e vê "Application error: a client-side
 * exception has occurred", que não diz nada.
 *
 * O conserto é recarregar — e a parte perigosa é NÃO recarregar quando o erro é outro.
 */

function comSessionStorage(): Record<string, string> {
  const dados: Record<string, string> = {};
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => dados[k] ?? null,
    setItem: (k: string, v: string) => {
      dados[k] = v;
    },
    removeItem: (k: string) => {
      delete dados[k];
    },
  });
  return dados;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("reconhecer o chunk velho", () => {
  /** A mensagem EXATA que apareceu em produção em 31/08. */
  it("reconhece o erro real que derrubou a tela", () => {
    expect(
      ehChunkVelho({ name: "ChunkLoadError", message: "Loading chunk 6993 failed." }),
    ).toBe(true);
  });

  it("reconhece as outras formas que ele assume entre navegadores", () => {
    for (const m of [
      "Failed to fetch dynamically imported module: https://tms/_next/x.js",
      "error loading dynamically imported module",
      "Loading chunk app-pages-internals failed",
    ]) {
      expect(ehChunkVelho({ name: "Error", message: m }), m).toBe(true);
    }
  });

  /**
   * O SENTIDO QUE MAIS IMPORTA: defeito de verdade NÃO é chunk velho.
   *
   * Recarregar um erro de código vira laço — a página quebra, recarrega, quebra —, apaga o rastro
   * que alguém usaria para achar o defeito e deixa a pessoa diante de uma tela piscando.
   */
  it("NÃO confunde defeito de código com chunk velho", () => {
    for (const m of [
      "Cannot read properties of undefined (reading 'reduce')",
      "t.map is not a function",
      "MISSING_MESSAGE: Could not resolve `Programacao.doca`",
      "NetworkError when attempting to fetch resource",
    ]) {
      expect(ehChunkVelho({ name: "TypeError", message: m }), m).toBe(false);
    }
  });

  it("aguenta erro sem nome nem mensagem", () => {
    expect(ehChunkVelho({})).toBe(false);
  });
});

describe("recarregar no máximo uma vez", () => {
  const CHUNK = { name: "ChunkLoadError", message: "Loading chunk 6993 failed." };

  it("a primeira vez recarrega", () => {
    comSessionStorage();
    expect(deveRecarregar(CHUNK)).toBe(true);
  });

  /**
   * O CASO DE 31/08, e a razão desta guarda existir.
   *
   * Naquele dia o servidor devolvia 404 num arquivo que ESTAVA no disco. Nenhuma recarga resolveria,
   * e sem esta trava a página teria entrado em laço infinito — escondendo a causa real por horas.
   */
  it("a segunda vez NÃO recarrega — senão vira laço", () => {
    comSessionStorage();
    expect(deveRecarregar(CHUNK)).toBe(true);
    expect(deveRecarregar(CHUNK)).toBe(false);
    expect(deveRecarregar(CHUNK)).toBe(false);
  });

  it("depois de a página se manter de pé, volta a poder recarregar", () => {
    // Sem isto, a primeira recarga bem-sucedida deixaria a marca para sempre e o SEGUNDO deploy do
    // dia não seria consertado sozinho.
    comSessionStorage();
    expect(deveRecarregar(CHUNK)).toBe(true);
    esquecerRecarga();
    expect(deveRecarregar(CHUNK)).toBe(true);
  });

  it("erro que não é chunk nunca recarrega, nem na primeira vez", () => {
    comSessionStorage();
    expect(deveRecarregar({ name: "TypeError", message: "x is not a function" })).toBe(false);
  });

  /**
   * Janela anônima, cookies bloqueados, navegador antigo: sem onde marcar, não há como garantir
   * "uma vez só". O desfecho seguro é a tela com o botão — a pessoa recarrega sabendo o que faz.
   */
  it("sem sessionStorage NÃO recarrega, em vez de arriscar o laço", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(deveRecarregar(CHUNK)).toBe(false);
    // E limpar não pode estourar: uma tela de erro que quebra ao se explicar é o pior desfecho.
    expect(() => esquecerRecarga()).not.toThrow();
  });
});
