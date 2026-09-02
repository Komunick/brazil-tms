import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * OS DOIS IMPEDIMENTOS APARECEM NA ATRIBUIÇÃO (2026-09-02, a pedido).
 *
 * ── O QUE FALTAVA ─────────────────────────────────────────────────────────────────────────────
 *
 * Dois estados diferentes têm o mesmo efeito prático — a atribuição não passa — e a tela só mostrava
 * um deles:
 *
 *   · `blocked_at`  — bloqueado POR NÓS, com motivo escrito. Aparecia riscado.
 *   · `status`      — a pessoa que o portal do CLIENTE desativou. Aparecia NORMAL, selecionável.
 *
 * Medido em produção no dia: **1 bloqueado por nós, 8 desativados pelo portal**. Os oito só falhavam
 * no fim do gesto, quando o espelho do portal recusa quem não está `active` — e quem escolheu o nome
 * descobria sem saber por quê.
 *
 * ── POR QUE LÊ O FONTE ────────────────────────────────────────────────────────────────────────
 *
 * A função consulta o banco; um teste de comportamento exigiria subir Postgres com as duas
 * situações. O defeito real é outro e mais barato de pegar: alguém "simplificar" o `or` de volta
 * para só `isNotNull(blockedAt)`, achando que `status` não é dali. O `where` volta a ficar curto, o
 * typecheck passa, os testes passam, e os oito voltam a aparecer selecionáveis.
 */
const fonte = readFileSync(join(__dirname, "driver-block.ts"), "utf8")
  // Comentário sai: este arquivo explica os dois impedimentos o tempo todo, e a explicação casaria
  // com as asserções abaixo sem o código precisar fazer nada.
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

describe("o mapa de impedidos da atribuição", () => {
  it("inclui o bloqueado por nós E o desativado pelo portal", () => {
    const trecho = fonte.slice(fonte.indexOf("bloqueiosPorIdDoPortal"));
    expect(trecho, "o bloqueio nosso saiu do mapa").toContain("isNotNull(drivers.blockedAt)");
    expect(
      trecho,
      "o desativado pelo portal saiu do mapa — ele volta a aparecer selecionável, e a atribuição " +
        "só falha no fim do gesto",
    ).toContain('ne(drivers.status, "active")');
    expect(trecho, "os dois precisam entrar, e por isso é `or`").toContain("or(");
  });

  /**
   * A LISTA DA ABA CONTINUA SÓ COM O NOSSO — e a assimetria é de propósito.
   *
   * A aba de bloqueados existe para DESFAZER, e desfazer a decisão do cliente não é escolha nossa.
   * Misturar as duas faria o botão de desbloquear pôr de volta na estrada exatamente quem o portal
   * dele tirou. Uniformizar as duas consultas pareceria faxina.
   */
  it("a lista da aba de bloqueados não herdou o estado do portal", () => {
    const trecho = fonte.slice(
      fonte.indexOf("listarMotoristasBloqueados"),
      fonte.indexOf("bloqueiosPorIdDoPortal"),
    );
    expect(
      trecho,
      "a aba passou a listar quem o portal desativou — o botão de desbloquear desfaria a decisão " +
        "do cliente",
    ).not.toContain("drivers.status");
  });
});
