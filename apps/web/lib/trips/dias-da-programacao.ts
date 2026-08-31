/**
 * A CONVERSÃO ENTRE O DIA QUE A TELA MOSTRA E O QUE FICA GUARDADO.
 *
 * A tela trabalha com datas (`2026-08-31`, que é como o servidor agrupa); a preferência guarda
 * DESLOCAMENTOS em relação a hoje (`-1`, `0`, `2`). O porquê está no esquema, em
 * `programacaoPrefsSchema`: data guardada morre na virada do dia, e o filtro teria de ser refeito
 * toda manhã.
 *
 * As duas funções vivem aqui, juntas e sob teste, porque é a ida e a volta que precisam concordar —
 * separadas, uma pode ganhar um ajuste de fuso que a outra não ganha, e o filtro passa a esconder o
 * dia errado sem errar em nada visível.
 */

/** Meio-dia, e não meia-noite: `2026-08-31T00:00` cai no dia anterior em qualquer fuso a oeste. */
function comoData(dia: string): Date {
  return new Date(`${dia}T12:00:00Z`);
}

const UM_DIA = 86_400_000;

/**
 * Quantos dias `dia` está à frente de `hoje`. Ontem é `-1`, hoje é `0`.
 *
 * Os dois vêm no formato `YYYY-MM-DD` e já são o dia de SÃO PAULO — quem faz essa conversão é quem
 * calcula o `hoje` da tela. Aqui os dois lados são tratados em UTC de propósito: fixar o fuso nas
 * duas pontas faz a subtração ser aritmética de calendário, sem horário de verão no meio.
 */
export function deslocamentoDoDia(dia: string, hoje: string): number {
  return Math.round((comoData(dia).getTime() - comoData(hoje).getTime()) / UM_DIA);
}

/** O caminho de volta: `-1` com hoje em `2026-08-31` devolve `2026-08-30`. */
export function diaDoDeslocamento(deslocamento: number, hoje: string): string {
  const d = new Date(comoData(hoje).getTime() + deslocamento * UM_DIA);
  return d.toISOString().slice(0, 10);
}
