import { describe, expect, it } from "vitest";
import { CAMPOS_DO_CADASTRO } from "@brazil-tms/shared";
import { GRUPOS } from "@/components/pre-cadastros/conferencia-client";

/**
 * OS GRUPOS DA CONFERÊNCIA CONTRA A LISTA REAL DE CAMPOS (fatia 028, etapa 4).
 *
 * A tela agrupa os campos na ordem da CNH; `CAMPOS_DO_CADASTRO`, em `packages/shared`, decide quais
 * existem — e é a mesma lista que a rota de salvar usa para recusar chave desconhecida.
 *
 * As duas metades falham em silêncio se divergirem, e nos dois sentidos:
 *
 *   · Campo NOVO no cadastro e fora dos grupos: ele não aparece na tela. Ninguém o corrige, e o
 *     envio passa a ser recusado por algo que a pessoa não consegue nem ver.
 *   · Campo nos grupos e FORA do cadastro: um campo de texto que aceita digitação e vai para o
 *     nada. A pessoa corrige, salva, e a correção não chega à gerenciadora.
 *
 * O segundo é o pior dos dois: o primeiro pelo menos dá um erro.
 */
describe("os grupos da conferência", () => {
  const nosGrupos = GRUPOS.flatMap((g) => g.campos);

  it("cobrem TODOS os campos do cadastro — nenhum fica invisível na tela", () => {
    const faltando = CAMPOS_DO_CADASTRO.filter((c) => !nosGrupos.includes(c));
    expect(faltando).toEqual([]);
  });

  it("não inventam campo nenhum — o que se digita aqui tem de chegar ao envio", () => {
    const sobrando = nosGrupos.filter(
      (c) => !(CAMPOS_DO_CADASTRO as readonly string[]).includes(c),
    );
    expect(sobrando).toEqual([]);
  });

  it("não repetem campo em dois grupos", () => {
    // Dois campos de texto para o mesmo valor: um sobrescreve o outro, e qual depende da ordem.
    expect(new Set(nosGrupos).size).toBe(nosGrupos.length);
  });
});
