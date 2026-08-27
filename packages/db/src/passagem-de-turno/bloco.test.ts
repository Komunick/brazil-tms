import { describe, expect, it } from "vitest";
import { SETORES, TURNOS } from "@brazil-tms/shared";
import { CONTADORES_APURADOS, chavesCalculadasNoCatalogo } from "./bloco";

/**
 * O CATÁLOGO NÃO PODE PROMETER O QUE O CÓDIGO NÃO APURA (2026-08-26).
 *
 * ── O DEFEITO QUE ISTO EVITA ──────────────────────────────────────────────────────────────────
 *
 * Um contador marcado `calculado` no catálogo aparece na tela como número do sistema — sem campo
 * para digitar, com a autoridade de coisa medida. Se `contadoresApurados` não devolver aquela
 * chave, a tela mostra ZERO.
 *
 * E zero é a pior saída possível aqui. Não é um espaço em branco que faz alguém perguntar; é uma
 * afirmação. "Nenhum no show neste turno" lido de um resumo é motivo para não olhar, e o erro só
 * apareceria quando alguém agisse em cima dele — provavelmente no turno seguinte, longe da causa.
 *
 * Foi exatamente esse o engano da primeira versão deste catálogo: quinze contadores marcados como
 * calculados por otimismo, dos quais só quatro tinham dado confiável atrás.
 *
 * ── POR QUE O TESTE VIVE AQUI E NÃO NO PACOTE COMPARTILHADO ───────────────────────────────────
 *
 * Porque ele cruza DUAS declarações que moram em pacotes diferentes: a promessa (o catálogo, em
 * `@brazil-tms/shared`) e a entrega (`contadoresApurados`, aqui). Só este lado enxerga os dois.
 */
describe("todo contador `calculado` tem apuração de verdade", () => {
  it("nenhuma chave calculada fica sem implementação", () => {
    const semImplementacao: string[] = [];
    for (const setor of SETORES) {
      for (const turno of TURNOS) {
        for (const chave of chavesCalculadasNoCatalogo(setor, turno)) {
          if (!CONTADORES_APURADOS.includes(chave)) {
            semImplementacao.push(`${setor}/${turno}/${chave}`);
          }
        }
      }
    }
    expect(semImplementacao).toEqual([]);
  });

  /**
   * O lado oposto: apurar uma chave que o catálogo diz ser digitada é trabalho jogado fora — a
   * tela nunca mostraria o número, e a consulta rodaria a cada leitura do bloco sem que ninguém
   * visse o resultado.
   */
  it("nenhuma apuração fica sem chave correspondente no catálogo", () => {
    const declaradas = new Set(
      SETORES.flatMap((setor) =>
        TURNOS.flatMap((turno) => chavesCalculadasNoCatalogo(setor, turno)),
      ),
    );
    for (const chave of CONTADORES_APURADOS) {
      expect(
        declaradas.has(chave),
        `${chave} é apurado mas o catálogo não o marca como calculado`,
      ).toBe(true);
    }
  });

  /**
   * Hoje os quatro são todos da Programação. Este teste não trava isso — trava a CONTA: se alguém
   * promover um contador sem implementar, ou implementar sem promover, os dois testes acima pegam.
   * Este aqui só documenta o número atual, para que uma mudança seja consciente.
   */
  it("são quatro apurações hoje, todas da Programação", () => {
    expect(CONTADORES_APURADOS).toHaveLength(4);
    expect(chavesCalculadasNoCatalogo("PROGRAMACAO", "T1")).toEqual([...CONTADORES_APURADOS]);
    for (const setor of SETORES) {
      if (setor === "PROGRAMACAO") continue;
      for (const turno of TURNOS) {
        expect(chavesCalculadasNoCatalogo(setor, turno), setor).toEqual([]);
      }
    }
  });
});
