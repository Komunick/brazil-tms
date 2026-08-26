import type { StatusDaProgramacao } from "@brazil-tms/shared";

/**
 * O RÓTULO E A COR DE CADA STATUS DA PROGRAMAÇÃO — copiados da planilha (2026-08-26).
 *
 * ── POR QUE ISTO NÃO PODE MORAR EM `packages/shared` ──────────────────────────────────────────
 *
 * Nasceu lá, ao lado dos valores, e QUEBROU: o Tailwind varre só `./app`, `./components` e `./lib`
 * de `apps/web` (ver `tailwind.config.ts`). Uma classe escrita fora desses caminhos simplesmente
 * NÃO CHEGA ao CSS gerado.
 *
 * E o modo como isso falha é o pior possível — silencioso e parcial. `text-white` sobreviveu,
 * porque outro arquivo do app o usa; `bg-emerald-700` não, porque ninguém mais usa. O resultado foi
 * o selo "Enviado" em branco sobre branco, invisível. Os outros três também estavam sem fundo, e só
 * não pareciam quebrados porque o texto continuava legível.
 *
 * Nada acusa: o build passa, o typecheck passa, o teste passa. Quem descobre é quem olha a tela.
 *
 * Por isso a divisão é esta, e vale mantê-la: os VALORES ficam em `@brazil-tms/shared`, porque o
 * banco e a API precisam deles; a APARÊNCIA fica aqui, porque é do navegador — e porque é aqui que
 * o Tailwind olha.
 *
 * ── AS CORES SÃO AS DA PLANILHA, DE PROPÓSITO ─────────────────────────────────────────────────
 *
 * Quem trabalha na "PROGRAMAÇÃO 2026" há meses reconhece o verde escuro como "enviado" antes de ler
 * a palavra. Trocá-las por uma paleta nossa "mais bonita" custaria essa leitura e não devolveria
 * nada.
 *
 * O `Record` é fechado pelo tipo: um status novo em `STATUS_DA_PROGRAMACAO` que esquecesse de
 * ganhar aparência aqui vira erro de compilação, e não um selo sem cor descoberto na tela.
 */
export const APARENCIA_DO_STATUS: Record<StatusDaProgramacao, { rotulo: string; classe: string }> =
  {
    A_ENVIAR: {
      rotulo: "A enviar",
      classe: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
    },
    ENVIADO: {
      rotulo: "Enviado",
      classe: "bg-emerald-700 text-white dark:bg-emerald-600 dark:text-white",
    },
    PROG_OK: {
      rotulo: "Prog OK",
      classe: "bg-emerald-400 text-emerald-950 dark:bg-emerald-500 dark:text-emerald-950",
    },
    NO_SHOW: {
      rotulo: "No show",
      // Contorno em vez de preenchimento: na planilha o NO SHOW é o único claro, e essa diferença é
      // o que faz o olho parar nele numa coluna cheia de verdes.
      classe: "border border-rose-400 bg-transparent text-rose-600 dark:text-rose-400",
    },
  };
