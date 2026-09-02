import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { segundosDeEspera } from "./cliente";

/**
 * O LIMITE DE FREQUÊNCIA DA GERENCIADORA — `CodErro 102` (2026-09-02).
 *
 * ── O QUE ACONTECEU ───────────────────────────────────────────────────────────────────────────
 *
 * No primeiro `setMotorista` real da empresa, TRÊS tentativas seguidas morreram em "CONSUMO
 * INDEVIDO. 30 segundos" — 13:49:30, 13:49:42 e 13:50:37 — e só a quarta passou. Funcionou porque o
 * usuário clicou de novo, à mão, quatro vezes. Numa leva de cinquenta motoristas isso não escala.
 *
 * A credencial é UMA e é compartilhada com o robô de posições, que consulta de dois em dois
 * minutos. A colisão não é acidente raro: é o funcionamento normal do sistema.
 */
describe("quantos segundos ela pediu", () => {
  it("lê o número da mensagem dela", () => {
    expect(segundosDeEspera("CONSUMO INDEVIDO. 30 segundos")).toBe(30);
    expect(segundosDeEspera("CONSUMO INDEVIDO. 10 segundos")).toBe(10);
  });

  /**
   * SEM NÚMERO, ESPERA 30 — e o padrão é o maior que já vimos, não o menor.
   *
   * Errar para baixo devolve a mesma recusa e gasta uma das duas esperas à toa; errar para cima
   * custa alguns segundos numa fila que roda em segundo plano.
   */
  it("sem número na frase, usa o padrão", () => {
    expect(segundosDeEspera("CONSUMO INDEVIDO")).toBe(30);
    expect(segundosDeEspera("")).toBe(30);
  });
});

/**
 * A ESPERA PRECISA EXISTIR NO CAMINHO DA CHAMADA — e este guarda lê o fonte porque o que se garante
 * é a FORMA da recuperação, não um valor de retorno.
 *
 * Um teste de comportamento exigiria simular a gerenciadora recusando; o defeito real, porém, é
 * alguém "simplificar" o `chamar` de volta para um `throw` único. Isso o compilador não vê e
 * nenhum teste de unidade das outras funções nota.
 */
describe("o 102 espera, e não derruba o job", () => {
  const fonte = readFileSync(join(__dirname, "cliente.ts"), "utf8")
    // Comentário sai: este arquivo explica o 102 e os trinta segundos o tempo todo.
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

  it("trata o 102 antes de recusar", () => {
    expect(fonte, "o tratamento do limite sumiu — o job volta a morrer na primeira colisão").toContain(
      "COD_ERRO_CONSUMO_INDEVIDO",
    );
    expect(fonte, "a espera sumiu").toContain("setTimeout");
  });

  /**
   * A ESPERA É LIMITADA. Sem teto, uma gerenciadora em dia ruim prenderia o job para sempre — e um
   * job pendurado é pior que um job que falha, porque não aparece em lugar nenhum.
   */
  it("a espera tem teto", () => {
    expect(fonte, "o teto de esperas sumiu — o job poderia ficar pendurado").toContain(
      "ESPERAS_NO_LIMITE",
    );
    expect(fonte).toContain("esperasRestantes > 0");
  });
});
