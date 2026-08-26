import { describe, expect, it } from "vitest";
import { CAMPOS_REVELAVEIS } from "./portal-drivers-api";

/**
 * O NOME DO CAMPO DE CPF NO PORTAL (2026-08-26, depois de quatro dias perdidos).
 *
 * ── O QUE ACONTECEU ───────────────────────────────────────────────────────────────────────────
 *
 * Pedíamos `national_id`. Em 23/08 o portal passou a responder, só para esse campo:
 *
 *     retcode 271601065 — "You do not have permission to view this sensitive data."
 *
 * A mensagem é de AUTORIZAÇÃO, então parecia que a conta tinha perdido acesso — e a resposta certa
 * para isso seria falar com o fornecedor, não mexer em código. Era falso: a tela do portal continua
 * revelando o CPF pelo olho da lista, e a chamada que ela faz é `data_field=cpf`.
 *
 * Só mudou o NOME do campo. A mensagem apontava para o lugar errado.
 *
 * ── O CUSTO ───────────────────────────────────────────────────────────────────────────────────
 *
 * Quatro dias. Dos 1.449 motoristas em produção, 400 tinham CPF; desde 23/08 todo motorista novo
 * entrava sem — 71 em quatro dias. E CPF é obrigatório no `setPreSM`, então cada um vira uma viagem
 * que a aba GR bloqueia.
 *
 * ── O QUE ESTE TESTE PROTEGE ──────────────────────────────────────────────────────────────────
 *
 * Ele não adivinha o nome futuro — nenhum teste faz isso. Protege as duas decisões que se toma
 * DEPOIS de descobrir: pedir `cpf`, e continuar aceitando `national_id` de uma revelação em voo.
 *
 * Se alguém "limpar" a lista tirando `national_id`, o robô que já tinha pedido aquele campo teria a
 * entrega recusada pela validação da rota — e o CPF que chegou seria jogado fora.
 */
describe("os campos que a revelação do portal aceita", () => {
  it("pede `cpf`, que é o nome que o portal usa hoje", () => {
    expect(CAMPOS_REVELAVEIS).toContain("cpf");
  });

  /**
   * `national_id` fica na lista, e tirá-lo é a tentação óbvia.
   *
   * Ele não é mais PEDIDO — quem decide isso é `portal-drivers-apply.ts`, que empilha `"cpf"`. Mas
   * continua ACEITO, porque o robô entrega em fila e pode ter um pedido antigo em voo. O dado é o
   * mesmo; recusá-lo pelo rótulo perderia um CPF que já custou uma revelação da cota do portal.
   */
  it("continua aceitando `national_id`, para não perder revelação em voo", () => {
    expect(CAMPOS_REVELAVEIS).toContain("national_id");
  });

  it("os dois campos não sensíveis continuam lá", () => {
    expect(CAMPOS_REVELAVEIS).toContain("driver_name");
    expect(CAMPOS_REVELAVEIS).toContain("phone");
  });

  /**
   * A lista é o `z.enum` da rota que recebe a entrega do robô.
   *
   * Um valor duplicado ou vazio ali passa despercebido na leitura e vira validação torta em
   * produção — o tipo de coisa que ninguém confere porque "é só uma lista".
   */
  it("não tem valor repetido nem vazio", () => {
    expect(new Set(CAMPOS_REVELAVEIS).size).toBe(CAMPOS_REVELAVEIS.length);
    for (const c of CAMPOS_REVELAVEIS) expect(c.trim()).not.toBe("");
  });
});
