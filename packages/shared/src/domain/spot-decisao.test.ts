import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  estadoDaOferta,
  podeMandarAceite,
  type SituacaoDaOferta,
} from "./spot-decisao";

const base: SituacaoDaOferta = {
  tripId: null,
  aceitacaoDoPortal: null,
  ordemAberta: false,
  ultimaFalhou: false,
};

const com = (p: Partial<SituacaoDaOferta>): SituacaoDaOferta => ({ ...base, ...p });

describe("o estado da oferta de spot", () => {
  it("sem viagem no TMS, não há o que aceitar", () => {
    expect(estadoDaOferta(base)).toBe("sem_viagem");
    expect(podeMandarAceite(base)).toBe(false);
  });

  it("viagem esperando decisão, sem ordem em voo: dá para aceitar", () => {
    const s = com({ tripId: "t1", aceitacaoDoPortal: "Pending" });
    expect(estadoDaOferta(s)).toBe("esperando");
    expect(podeMandarAceite(s)).toBe(true);
  });

  it("ordem em voo: o cartão fica, dizendo que espera o portal", () => {
    const s = com({ tripId: "t1", aceitacaoDoPortal: "Pending", ordemAberta: true });
    expect(estadoDaOferta(s)).toBe("enviado");
    // Já há decisão em andamento; uma segunda ordem é impossível (índice parcial de portal_commands).
    expect(podeMandarAceite(s)).toBe(false);
  });

  it("a última ordem falhou e não há outra: dá para tentar de novo", () => {
    const s = com({ tripId: "t1", aceitacaoDoPortal: "Pending", ultimaFalhou: true });
    expect(estadoDaOferta(s)).toBe("recusado");
    /*
      Recusado PODE tentar de novo, e é decisão: a recusa tem duas causas possíveis — corrida perdida
      (outro pegou a LH) ou estado velho do nosso lado (a aceitação que o TMS conhece tem até 20 s de
      idade) — e a tela não sabe qual. Quem está olhando decide.
    */
    expect(podeMandarAceite(s)).toBe(true);
  });

  /**
   * O CASO QUE MAIS IMPORTA: `Accepted` vence TODAS as outras entradas.
   *
   * A verdade é do portal; a ordem é só o nosso pedido. Uma viagem já nossa com uma ordem recusada
   * pendurada não pode continuar na tela mostrando um erro que não interessa mais a ninguém.
   */
  it("aceito vence qualquer combinação das outras entradas", () => {
    const combinacoes: SituacaoDaOferta[] = [
      com({ tripId: "t1", aceitacaoDoPortal: "Accepted" }),
      com({ tripId: "t1", aceitacaoDoPortal: "Accepted", ordemAberta: true }),
      com({ tripId: "t1", aceitacaoDoPortal: "Accepted", ultimaFalhou: true }),
      com({ tripId: "t1", aceitacaoDoPortal: "Accepted", ordemAberta: true, ultimaFalhou: true }),
      // Sem tripId é combinação impossível na prática, e mesmo assim a aceitação manda.
      com({ aceitacaoDoPortal: "Accepted" }),
    ];
    for (const s of combinacoes) {
      expect(estadoDaOferta(s), JSON.stringify(s)).toBe("aceito");
      expect(podeMandarAceite(s), JSON.stringify(s)).toBe(false);
    }
  });

  it("aceitação desconhecida não vira esperando", () => {
    // O portal pode devolver um valor que não conhecemos. Tratá-lo como pendente ofereceria um
    // aceite que ele recusaria — e gastaria uma ida ao portal para descobrir.
    expect(estadoDaOferta(com({ tripId: "t1", aceitacaoDoPortal: "Whatever" }))).toBe("sem_viagem");
    expect(estadoDaOferta(com({ tripId: "t1", aceitacaoDoPortal: null }))).toBe("sem_viagem");
  });
});

/**
 * O INVARIANTE I1 — NINGUÉM ESCREVE "ACEITA" DO NOSSO LADO (2026-09-01).
 *
 * A fatia inteira se apoia nisto: o cartão sai da tela porque o portal disse `Accepted`, e por
 * nenhuma outra decisão. A garantia não é disciplina — é ausência de lugar onde gravar. Este teste
 * é o que impede alguém de criar esse lugar depois, quando a derivação parecer cara.
 *
 * ── POR QUE ELE TIRA OS COMENTÁRIOS ANTES DE OLHAR ────────────────────────────────────────────
 *
 * Esta base já pagou duas vezes por um teste que lê código-fonte e esbarra na frase que EXPLICA a
 * regra. O sintoma é cruel: o teste acusa o comentário, e "consertá-lo" significa apagar o porquê.
 * Aqui os comentários saem antes de qualquer asserção — inclusive os deste arquivo, que fala de
 * `spot_offer` e de aceitação o tempo todo.
 */
describe("I1 — nada grava a aceitação da oferta do nosso lado", () => {
  const RAIZ = join(__dirname, "../../../..");

  /** Tira comentários de linha, comentários de bloco e os textos entre aspas: sobra o CÓDIGO. */
  const semComentarios = (fonte: string): string =>
    fonte
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");

  const arquivosDe = (dir: string): string[] => {
    let saida: string[] = [];
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (nome === "node_modules" || nome === "dist" || nome === ".next") continue;
      if (statSync(caminho).isDirectory()) saida = saida.concat(arquivosDe(caminho));
      else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(caminho);
    }
    return saida;
  };

  /**
   * A PRIMEIRA VERSÃO DESTE GUARDA ERA LARGA DEMAIS, e vale contar (2026-09-01).
   *
   * Ela acusava qualquer identificador começado em "aceit" perto de `spotOffer` — e a primeira coisa
   * que pegou foi o próprio código de LEITURA (`aceitacaoDoPortal: sql\`…\``), que é exatamente o que
   * a fatia quer que exista. Um guarda que proíbe ler o campo do portal proíbe a solução.
   *
   * O que se quer proibir é ESCRITA, e escrita tem duas formas concretas e só duas:
   *
   *   1. uma COLUNA na tabela da oferta que guarde a aceitação — o lugar onde alguém a copiaria;
   *   2. um `update` na tabela da oferta — o gesto de mudar a linha depois de gravada.
   *
   * Procurar essas duas coisas é preciso; procurar vocabulário é aproximação, e aproximação num
   * guarda de código vira ou falso alarme (foi este caso) ou falsa segurança.
   */
  it("a tabela da oferta não tem coluna que guarde aceitação", () => {
    const schema = join(RAIZ, "packages/db/schema/spot-offers.ts");
    const codigo = semComentarios(readFileSync(schema, "utf8"));

    // Os nomes de coluna sobrevivem ao corte de aspas porque `text("x")` vira `text("")`; o nome do
    // CAMPO no objeto drizzle, não. É ele que se procura: `aceitaEm:`, `aceito:`, `acceptedAt:`…
    const camposSuspeitos = [...codigo.matchAll(/^\s*(\w*(?:aceit|accept)\w*)\s*:/gim)].map(
      (m) => m[1]!,
    );

    expect(
      camposSuspeitos,
      `A tabela da oferta ganhou campo(s) de aceitação: ${camposSuspeitos.join(", ")}.\n` +
        "O estado 'aceito' é LIDO de `trips.customer_fields->>'Aceitação (portal)'`, nunca copiado " +
        "para cá — é o que garante o FR-014 por construção. Ver `spot-decisao.ts`.",
    ).toEqual([]);
  });

  it("ninguém dá update na oferta depois de gravada", () => {
    const dirs = [join(RAIZ, "packages/db/src"), join(RAIZ, "apps/web/app/api")].filter((d) => {
      try {
        return statSync(d).isDirectory();
      } catch {
        return false;
      }
    });
    expect(dirs.length, "nenhum diretório para varrer — o teste não estaria provando nada").toBe(2);

    const acusados: string[] = [];
    for (const dir of dirs) {
      for (const arquivo of arquivosDe(dir)) {
        const codigo = semComentarios(readFileSync(arquivo, "utf8"));
        // `update(spotOffers)` em drizzle, ou um UPDATE cru na tabela.
        if (/\.update\s*\(\s*spotOffers\b/.test(codigo) || /\bupdate\s+spot_offers\b/i.test(codigo)) {
          acusados.push(arquivo.slice(RAIZ.length + 1).replace(/\\/g, "/"));
        }
      }
    }

    expect(
      acusados,
      `Estes arquivos ALTERAM a linha da oferta:\n  ${acusados.join("\n  ")}\n` +
        "A oferta é um retrato do que o monitor viu; o que muda é o estado da DECISÃO, e ele mora " +
        "na viagem e na fila de ordens. Ver `spot-decisao.ts`.",
    ).toEqual([]);
  });
});
