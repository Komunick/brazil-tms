import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * COMPONENTE CONSTRUÍDO E NUNCA USADO — o defeito que este arquivo existe para impedir.
 *
 * ── O QUE ACONTECEU EM 31/08 ──────────────────────────────────────────────────────────────────
 *
 * A fase 6 da fatia 029 entregou `MiniPerfil`, `NomeClicavel`, as rotas da foto e o job de descarte.
 * Tudo compilava, tudo passava nos testes, e as tarefas foram marcadas como feitas.
 *
 * **Nenhuma tela importava os componentes.** O usuário perguntou "cadê a parte do perfil?" e a
 * resposta era: em lugar nenhum. Existir não é estar na tela.
 *
 * É o padrão que a memória do projeto chama de `dado-capturado-e-nunca-mostrado` — "o código faz X"
 * não prova que alguém VÊ X —, e foi o quinto caso registrado.
 *
 * ── POR QUE UM TESTE, E NÃO DISCIPLINA ────────────────────────────────────────────────────────
 *
 * Porque o defeito é uma AUSÊNCIA, e ausência não tem tipo: o compilador está satisfeito, o lint
 * está satisfeito, os testes do componente passam. Só a contagem acusa.
 *
 * ── O QUE ELE NÃO PROVA ───────────────────────────────────────────────────────────────────────
 *
 * Que o componente aparece de fato para alguém: ele pode estar importado atrás de uma condição que
 * nunca é verdadeira. Isso continua sendo trabalho de olhar a tela. O que ele tranca é o degrau
 * anterior, que é o que falhou — o componente que não é importado por ninguém.
 */
/**
 * ELE MORA EM `lib/`, e não ao lado do componente que protege — de propósito.
 *
 * A primeira versão ficou em `components/usuarios/`, e **não rodava**: o vitest do `web` só recolhe
 * teste dentro de `lib`. Um guarda que não roda é pior que guarda nenhum — ele dá a sensação
 * de estar coberto. Descoberto ao rodá-lo pela primeira vez, que é o mínimo que se faz com um teste
 * novo.
 */
const PASTA = join(__dirname, "../../components/usuarios");
const APP = join(__dirname, "../..");

/** Todo `.ts`/`.tsx` do app, menos build e a própria pasta dos componentes de usuário. */
function arquivosDoApp(dir: string, achados: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    if (item === "node_modules" || item === ".next" || item === "usuarios") continue;
    const caminho = join(dir, item);
    if (statSync(caminho).isDirectory()) arquivosDoApp(caminho, achados);
    else if (/\.tsx?$/.test(item)) achados.push(caminho);
  }
  return achados;
}

const FORA = arquivosDoApp(APP)
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

/** Os componentes desta pasta que precisam ter dono — os `.tsx` que não são teste. */
const COMPONENTES = readdirSync(PASTA)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => f.replace(/\.tsx$/, ""));

describe("os componentes de usuário estão em ALGUMA tela", () => {
  it("achou os componentes — senão o teste passaria por vazio", () => {
    // Um teste que varre e não acha nada passa em silêncio, e é assim que um guarda morre.
    expect(COMPONENTES.length).toBeGreaterThanOrEqual(3);
  });

  it.each(COMPONENTES)("`%s` é importado por alguém de fora desta pasta", (nome) => {
    /**
     * `MiniPerfil` é importado pelos dois outros componentes desta pasta, e por isso ele fica de
     * fora da varredura — mas os DOIS precisam ter dono, e é isso que fecha a cadeia: se
     * `NomeClicavel` e `MeuPerfil` estão numa tela, o cartão chega junto.
     */
    if (nome === "mini-perfil") {
      const irmaos = readdirSync(PASTA)
        .filter((f) => f.endsWith(".tsx") && f !== "mini-perfil.tsx")
        .map((f) => readFileSync(join(PASTA, f), "utf8"))
        .join("\n");
      expect(irmaos).toContain("mini-perfil");
      return;
    }
    expect(FORA).toContain(`components/usuarios/${nome}`);
  });
});
