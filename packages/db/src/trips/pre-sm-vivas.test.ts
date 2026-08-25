import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VIVAS } from "./pre-sm";

/**
 * O CÓDIGO E O ÍNDICE PRECISAM CONCORDAR SOBRE O QUE É UMA LINHA VIVA (2026-08-25, fatia 026).
 *
 * `VIVAS` decide o que a tela mostra e o que o trabalho considera "já existe"; o índice único
 * parcial `trip_pre_sm_viva_uk` é quem garante isso de verdade, no banco. São duas declarações da
 * mesma regra, em linguagens diferentes, e nada além deste teste as obriga a bater.
 *
 * ── OS DOIS JEITOS DE DIVERGIR, E O QUE CADA UM CUSTA ─────────────────────────────────────────
 *
 * Um estado a mais no CÓDIGO: o índice deixa passar o segundo `insert`, nascem duas Pré-SM para a
 * mesma viagem, e a gerenciadora cobra as duas.
 *
 * Um estado a mais no ÍNDICE: a viagem fica travada. A colisão é lida como "já existe", nova
 * tentativa nunca nasce, e nenhum erro aparece em lugar nenhum.
 *
 * O segundo aconteceu. `pendente` era o estado de toda viagem processada com a integração
 * desligada, e nenhuma delas conseguiria tentar de novo depois — o defeito só apareceria no
 * primeiro teste real, como "o sistema não fez nada".
 */
describe("as linhas vivas da Pré-SM", () => {
  const sql = readFileSync(
    join(__dirname, "../../migrations/0046_pre_sm_na_logae.sql"),
    "utf8",
  );

  /** Os valores dentro do `WHERE status IN (...)` do índice, lidos do próprio SQL. */
  const noIndice = (() => {
    const m = sql.match(/trip_pre_sm_viva_uk[\s\S]*?WHERE\s+"?status"?\s+IN\s*\(([^)]*)\)/i);
    if (!m?.[1]) throw new Error("índice `trip_pre_sm_viva_uk` não encontrado na migração 0046");
    return m[1]
      .split(",")
      .map((v) => v.trim().replace(/^'|'$/g, ""))
      .filter(Boolean)
      .sort();
  })();

  it("o código e o índice listam exatamente os mesmos estados", () => {
    expect(noIndice).toEqual([...VIVAS].sort());
  });

  /**
   * O caso específico que motivou tudo isto.
   *
   * `nao_tentada` é o estado de "estava pronto e a integração não estava ligada". Ele PRECISA ficar
   * de fora: se contasse como viva, todo o dia de observação com o interruptor desligado deixaria
   * um rastro de viagens permanentemente impedidas de gerar Pré-SM.
   */
  it("`nao_tentada` fica de fora — senão o dia de observação travaria as viagens", () => {
    expect(VIVAS).not.toContain("nao_tentada");
    expect(noIndice).not.toContain("nao_tentada");
  });

  /**
   * `sem_dados` e `recusada` também ficam de fora, e pelo mesmo motivo: os dois se resolvem — um
   * completando o cadastro, o outro conversando com a gerenciadora — e depois a viagem precisa
   * poder tentar de novo.
   */
  it("os estados que se resolvem também deixam a viagem tentar de novo", () => {
    for (const s of ["sem_dados", "recusada", "cancelada"]) {
      expect(VIVAS).not.toContain(s);
    }
  });
});
