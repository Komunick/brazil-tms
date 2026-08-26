import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NENHUMA CLASSE DE TAILWIND PODE MORAR NESTE PACOTE (2026-08-26, depois de quebrar).
 *
 * ── O QUE ACONTECEU ───────────────────────────────────────────────────────────────────────────
 *
 * Os quatro status da programação nasceram aqui com rótulo E cor, ao lado dos valores — parecia o
 * lugar certo, porque significado e aparência andam juntos.
 *
 * Só que o Tailwind varre `./app`, `./components` e `./lib` de `apps/web` (ver `tailwind.config.ts`),
 * e mais nada. Classe escrita neste pacote NÃO CHEGA ao CSS gerado.
 *
 * ── E O MODO COMO FALHA É O PIOR POSSÍVEL ─────────────────────────────────────────────────────
 *
 * Silencioso e PARCIAL. Medido no build que estava no ar em 26/08:
 *
 *   `text-white`      presente  (outro arquivo do app o usa)
 *   `bg-emerald-700`  AUSENTE   → o selo "Enviado" ficou branco sobre branco, invisível
 *   `bg-slate-200`    AUSENTE   → "A enviar" sem fundo
 *   `border-rose-400` AUSENTE   → "No show" sem contorno
 *   `bg-emerald-400`  presente  → "Prog OK" funcionou POR COINCIDÊNCIA
 *
 * Três dos quatro quebrados, um funcionando por acaso — e build, typecheck e testes todos verdes.
 * Quem descobre é quem olha a tela, e só o que estiver mais visível.
 *
 * ── POR QUE UM TESTE, E NÃO ACRESCENTAR ESTE PACOTE AO `content` ──────────────────────────────
 *
 * Porque a divisão está certa: este pacote é lido pelo banco, pelo worker e pela API, nenhum dos
 * quais tem CSS. Pôr o pacote no `content` do Tailwind faria a armadilha sumir e a confusão ficar —
 * regra de domínio e folha de estilo no mesmo arquivo, para sempre.
 *
 * A aparência dos status vive em `apps/web/lib/trips/aparencia-do-status.ts`.
 */
describe("o pacote shared não carrega classe de Tailwind", () => {
  /**
   * Só as classes de COR com escala numérica (`bg-emerald-700`, `text-slate-800`).
   *
   * São as que quebram deste jeito e as que não têm outro significado em português — procurar por
   * `flex` ou `border` sozinhos acusaria texto comum e ensinaria a ignorar o teste, que é como um
   * teste morre.
   */
  const CLASSE = new RegExp(
    "\\b(bg|text|border|ring|from|via|to|decoration|outline|shadow|divide|accent|caret|fill|stroke|placeholder)-" +
      "(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-" +
      "\\d{2,3}\\b",
  );

  function arquivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nome) => {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) return arquivos(caminho);
      // Este arquivo cita as classes de propósito, para explicar o que quebrou.
      if (nome === "sem-classes-de-tailwind.test.ts") return [];
      return nome.endsWith(".ts") ? [caminho] : [];
    });
  }

  it("nenhum arquivo de src/ contém uma classe de cor", () => {
    const culpados: string[] = [];
    for (const caminho of arquivos(join(__dirname, ".."))) {
      const conteudo = readFileSync(caminho, "utf8");
      for (const [i, linha] of conteudo.split(/\r?\n/).entries()) {
        const achou = CLASSE.exec(linha);
        if (achou)
          culpados.push(`${caminho.split(/[\\/]/).slice(-2).join("/")}:${i + 1} → ${achou[0]}`);
      }
    }
    expect(
      culpados,
      "Classe de Tailwind neste pacote NÃO chega ao CSS — mova para apps/web/lib ou components:\n" +
        culpados.join("\n"),
    ).toEqual([]);
  });
});
