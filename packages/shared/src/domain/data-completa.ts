/**
 * A DATA ESTÁ COMPLETA? — o guarda dos campos de data dos filtros (2026-09-04).
 *
 * ── POR QUE ISTO SAIU DE DENTRO DO COMPONENTE ─────────────────────────────────────────────────
 *
 * Ela vivia como uma expressão solta na tela de filtros da Torre de Controle, e estava ERRADA:
 *
 *     const DATA_COMPLETA = /^d{4}-d{2}-d{2}$/;
 *
 * Sem a barra invertida, `d` é a letra d. A expressão procurava o texto literal "dddd-dd-dd" e não
 * casava com data nenhuma — nunca. E o campo a usava assim:
 *
 *     onBlur={() => setFilters({ pickupFrom: DATA_COMPLETA.test(pickupFrom) ? pickupFrom : undefined })}
 *
 * Ou seja: escolher uma data e sair do campo APAGAVA o filtro, toda vez. O relato foi "filtrar por
 * data não está funcionando, quero pegar viagens de 1 mês atrás e não está indo" — e não estava
 * mesmo: o filtro se limpava sozinho antes de a consulta sair.
 *
 * ── E POR QUE AQUI, E NÃO CONSERTADA NO LUGAR ─────────────────────────────────────────────────
 *
 * Porque o defeito não foi o erro de digitação — foi ele ter sobrevivido. Uma expressão dentro de um
 * componente não tem como ser testada sem montar a tela inteira, então ninguém a testou, e ela
 * passou pelo typecheck e pelo lint sem uma reclamação: `/^d{4}$/` é uma expressão VÁLIDA.
 *
 * Aqui ela é uma função pura com teste ao lado, e o teste falha no segundo em que a barra sumir.
 */

/**
 * `2026-08-04` → `true`. Qualquer coisa incompleta ou mal formada → `false`.
 *
 * ── SÓ A FORMA, e não o calendário ────────────────────────────────────────────────────────────
 *
 * `2026-13-45` passa aqui, e é de propósito: quem valida dia e mês é o campo nativo do navegador,
 * que não deixa digitar mês 13. O trabalho desta função é outro e mais estreito — dizer se o valor
 * já está INTEIRO, para o filtro não sair enquanto a pessoa ainda está no meio do ano.
 *
 * Alargá-la para validar calendário faria duas verdades sobre a mesma data, e a daqui envelheceria
 * primeiro.
 */
export function ehDataCompleta(valor: string | null | undefined): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor ?? "");
}
