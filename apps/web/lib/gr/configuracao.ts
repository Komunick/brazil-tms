import "server-only";

/**
 * OS DOIS VALORES FIXOS QUE O `setPreSM` EXIGE (2026-08-26, fatia 027).
 *
 * `CodFilial` e `CodPerfilSeguranca` são do cadastro da gerenciadora, e variam por cliente. Medidos
 * em 25/08 para a Brazil Transports:
 *
 *   `INTEGRA_COD_FILIAL=9332`             de `getTabela(NomeTabela: "FILIAIS")`
 *   `INTEGRA_COD_PERFIL_SEGURANCA=20785`  de `getTabela(NomeTabela: "PERFIL_SEGURANCA")` — DDR SHOPEE
 *
 * ── POR QUE CONFIGURAÇÃO E NÃO CONSTANTE NO CÓDIGO ────────────────────────────────────────────
 *
 * O princípio V da constituição é explícito: variação por cliente é configuração. Hoje só existe um
 * cliente com Pré-SM; um segundo com outro perfil não pode exigir código novo.
 *
 * ── AUSENTE É UM ESTADO LEGÍTIMO ──────────────────────────────────────────────────────────────
 *
 * Sem os dois, nada é enviado — e a tela diz que a integração não está configurada, em vez de
 * listar isso como se fosse trabalho de cadastro de alguém. É defeito de instalação, não de dado, e
 * confundir os dois faria a fila pedir a uma pessoa que resolvesse algo que não é dela.
 */
export function configuracaoDaIntegra(): {
  codFilial: number | null;
  codPerfilSeguranca: number | null;
} {
  const n = (v: string | undefined) => {
    const x = Number(String(v ?? "").trim());
    return Number.isFinite(x) && x > 0 ? x : null;
  };
  return {
    codFilial: n(process.env.INTEGRA_COD_FILIAL),
    codPerfilSeguranca: n(process.env.INTEGRA_COD_PERFIL_SEGURANCA),
  };
}
