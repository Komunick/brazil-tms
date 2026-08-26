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
      // Azul escuro. No tema escuro ele clareia um passo, senão some no fundo da página.
      classe: "bg-blue-900 text-white dark:bg-blue-800 dark:text-white",
    },
    ENVIADO: {
      rotulo: "Enviado",
      /**
       * Preto — e no tema escuro ele ganha um contorno.
       *
       * Preto sobre fundo escuro perde a BORDA: o texto continua legível, mas o selo deixa de ser
       * um selo e vira texto solto, e o olho não o acha mais numa coluna. O anel devolve o
       * contorno sem clarear o preto, que é o que o usuário pediu.
       */
      classe:
        "bg-neutral-900 text-white dark:bg-black dark:text-white dark:ring-1 dark:ring-white/25",
    },
    PROG_OK: {
      rotulo: "Prog OK",
      // Mantido: é o verde da planilha, e o usuário pediu para não mexer.
      classe: "bg-emerald-400 text-emerald-950 dark:bg-emerald-500 dark:text-emerald-950",
    },
    NO_SHOW: {
      rotulo: "No show",
      // Violeta.
      classe: "bg-violet-600 text-white dark:bg-violet-500 dark:text-white",
    },
  };
