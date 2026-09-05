import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A BUSCA DA TORRE ACHA PELO NOME DO MOTORISTA — PELAS DUAS FONTES (2026-09-04).
 *
 * ── O QUE ACONTECEU ───────────────────────────────────────────────────────────────────────────
 *
 * "A busca da torre de controle está muito ruim, quero achar viagens de NARCISIO MANOEL DA SILVA e
 * não acho, só por LH." Era verdade: o predicado cobria LH, cliente, origem e destino. Motorista
 * não estava lá, e não havia nada na tela dizendo isso — o campo só devolvia vazio.
 *
 * ── POR QUE ESTE TESTE LÊ O CÓDIGO-FONTE ──────────────────────────────────────────────────────
 *
 * Provar o comportamento exigiria subir Postgres com viagens nas duas situações. O defeito que
 * ameaça isto não é de comportamento, é de intenção: alguém "simplifica" o `or(...)` deixando só
 * `boardDriver.name`, porque parece a fonte natural do motorista. Passaria no typecheck e em todo
 * teste existente, e o sintoma seria mudo — a busca acharia menos e ninguém saberia quanto menos.
 *
 * ── OS DOIS NÚMEROS QUE OBRIGAM AS DUAS FONTES (medidos na produção em 04/09) ─────────────────
 *
 *  - 538 viagens CONCLUÍDAS não têm atribuição corrente nenhuma (519 delas porque o motorista
 *    estava `inactive` e o espelho recusa gravar motorista inativo). Só `boardDriver.name` acharia
 *    ZERO dessas.
 *  - 37 de 683 pares divergem: quando o cliente troca o condutor na origem, a nossa atribuição
 *    guarda o nome VELHO até o espelho aplicar. Procurando pelo nome NOVO, só o campo do portal
 *    acha.
 *
 * Nenhuma das duas fontes basta sozinha. É a mesma lição do cabeçalho de `placas-do-motorista.ts`.
 */
const fonte = readFileSync(join(__dirname, "trips-read.ts"), "utf8")
  /*
    COMENTÁRIO SAI ANTES DA ASSERÇÃO.

    Este projeto já errou isto duas vezes, e aqui a armadilha é literal: o comentário que escrevi
    ao lado do predicado CITA `Motorista (portal)` para explicar por que ele existe. Sem remover
    comentário, o teste passaria lendo a explicação mesmo depois de alguém apagar o código.
  */
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

/**
 * Só o predicado da busca, e não o arquivo inteiro: `boardDriver.name` aparece em outros pontos
 * (na projeção, no filtro por `driverId`), e casar com eles daria um teste que passa mesmo com a
 * busca quebrada.
 */
const predicado = (() => {
  const inicio = fonte.indexOf("const search = or(");
  const fim = fonte.indexOf("if (search)", inicio);
  expect(inicio, "o predicado da busca mudou de forma — reveja este teste").toBeGreaterThan(-1);
  expect(fim, "o fecho do predicado da busca mudou — reveja este teste").toBeGreaterThan(inicio);
  return fonte.slice(inicio, fim);
})();

describe("a busca da Torre de Controle", () => {
  it("procura pelo motorista da NOSSA atribuição", () => {
    expect(predicado).toContain("boardDriver.name");
  });

  /**
   * O CASO QUE MOTIVOU A FATIA. Sem isto, as 538 concluídas sem atribuição ficam inalcançáveis
   * pelo nome de quem dirigiu — e elas são 13,4% de todas as concluídas.
   */
  it("procura também pelo motorista que o PORTAL informa", () => {
    expect(predicado).toContain("Motorista (portal)");
  });

  /**
   * As duas somam com OU. Se alguém trocar por E, quem procurar por um nome só acha as viagens em
   * que as duas fontes concordam — justamente as que nunca foram o problema.
   */
  it("as fontes somam, não se exigem", () => {
    expect(predicado.startsWith("const search = or(")).toBe(true);
  });

  /**
   * O que já funcionava continua: colar uma lista de LHs é o gesto de 21/08 e não pode ter sido
   * atropelado por esta mudança.
   */
  it("não perdeu a busca por LH, cliente nem rota", () => {
    for (const campo of [
      "trips.externalTripId",
      "customers.name",
      "originLoc.name",
      "destLoc.name",
    ]) {
      expect(predicado, `${campo} sumiu do predicado da busca`).toContain(campo);
    }
  });
});
