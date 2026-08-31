import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, type PermissionKey } from "./permissions";
import {
  CAPACIDADE_DE_ADMINISTRAR,
  motivosParaRecusar,
  type EstadoDaMudanca,
} from "./cargo-invariantes";

const TUDO = new Set<PermissionKey>(ALL_PERMISSIONS);

const estado = (over: Partial<EstadoDaMudanca> = {}): EstadoDaMudanca => ({
  concedidas: ["view_all_trips"],
  catalogo: ALL_PERMISSIONS,
  doEditor: TUDO,
  administradoresDepois: null,
  ...over,
});

describe("a mudança permitida não devolve motivo nenhum", () => {
  it("conceder o que existe, tendo o que se concede, sobrando administrador", () => {
    expect(motivosParaRecusar(estado({ administradoresDepois: 3 }))).toEqual([]);
  });

  it("um cargo VAZIO é permitido — é como todo cargo nasce", () => {
    // A tela avisa antes de salvar, porque parece defeito. Mas é legítimo: o "Sem acesso" da
    // migração é exatamente isso, e é onde cai quem não tem papel no catálogo.
    expect(motivosParaRecusar(estado({ concedidas: [], administradoresDepois: 2 }))).toEqual([]);
  });
});

/**
 * OS QUATRO CAMINHOS DO FR-010 — e o ponto deste bloco é que eles são O MESMO caminho.
 *
 * Desativar o cargo que administra, tirar a capacidade dele, mover a última pessoa, desativá-la:
 * quatro rotas na API, uma pergunta só. Se cada rota tivesse a própria validação, elas divergiriam
 * em silêncio — alguém consertaria uma e as outras três continuariam abrindo o buraco.
 *
 * Aqui o que chega é o resultado da contagem que o BANCO faz depois da escrita. Esta função não
 * conta ninguém, e é por isso que os quatro casos abaixo são idênticos: eles JÁ são o mesmo caso.
 */
describe("a trava do último administrador (FR-010)", () => {
  it.each([
    ["desativar o cargo que administra"],
    ["tirar `manage_users` do último cargo que a tem"],
    ["mover a última pessoa que administra"],
    ["desativar essa pessoa"],
  ])("recusa: %s", () => {
    expect(motivosParaRecusar(estado({ administradoresDepois: 0 }))).toContain("ULTIMO_ADMIN");
  });

  it("um administrador restante JÁ BASTA — a regra é não chegar a zero", () => {
    /**
     * Exigir dois seria mais seguro e não é o que o requisito diz. E teria um custo real: uma
     * empresa com um administrador só não conseguiria mexer em cargo nenhum, e o primeiro efeito
     * seria alguém contornar a tela pelo banco.
     */
    expect(motivosParaRecusar(estado({ administradoresDepois: 1 }))).not.toContain("ULTIMO_ADMIN");
  });

  it("não opina quando a contagem não foi feita", () => {
    // `null` é "esta operação não mexe em administração". Tratar como zero recusaria toda edição de
    // cargo que não tem nada a ver com administrar usuários.
    expect(motivosParaRecusar(estado({ administradoresDepois: null }))).toEqual([]);
  });

  it("a capacidade que a trava protege é `manage_users`", () => {
    // Trancado aqui porque a consulta do banco e esta constante precisam falar da MESMA capacidade.
    expect(CAPACIDADE_DE_ADMINISTRAR).toBe("manage_users");
  });
});

describe("ninguém amplia o próprio alcance (FR-012)", () => {
  it("recusa conceder o que quem edita não tem", () => {
    /**
     * Sem esta regra, quem administra usuários se concede tudo em dois cliques, e a separação de
     * cargos vira decoração. Ela limita o que se pode DAR, não o que se pode ver.
     */
    const editorLimitado = new Set<PermissionKey>(["manage_users", "view_all_trips"]);
    const motivos = motivosParaRecusar(
      estado({ concedidas: ["view_all_trips", "export_billing"], doEditor: editorLimitado }),
    );
    expect(motivos).toContain("ALEM_DO_PROPRIO_ACESSO");
  });

  it("conceder exatamente o que se tem é permitido", () => {
    const editor = new Set<PermissionKey>(["manage_users", "view_all_trips"]);
    expect(
      motivosParaRecusar(estado({ concedidas: ["view_all_trips"], doEditor: editor })),
    ).toEqual([]);
  });
});

describe("o resto das recusas", () => {
  it("capacidade fora do catálogo é recusada na entrada", () => {
    // Ela nunca seria concedida por `can` — falharia FECHADA, sem erro nenhum. Recusar aqui é o que
    // transforma um engano silencioso numa mensagem.
    expect(motivosParaRecusar(estado({ concedidas: ["voar"] }))).toContain("PERMISSAO_DESCONHECIDA");
  });

  it("desativar cargo com gente dentro e sem destino é recusado (FR-011)", () => {
    expect(motivosParaRecusar(estado({ pessoasSemDestino: 14 }))).toContain("CARGO_COM_PESSOAS");
  });

  it("com destino declarado, passa", () => {
    expect(motivosParaRecusar(estado({ pessoasSemDestino: 0 }))).toEqual([]);
  });
});

describe("devolve TODOS os motivos, não o primeiro", () => {
  it("três problemas de uma vez viram três motivos", () => {
    /**
     * Recusar um de cada vez faz a pessoa corrigir, tentar, e descobrir o seguinte — três idas até
     * entender o que era preciso. É a mesma decisão que a 027 tomou no corpo da Pré-SM.
     */
    const motivos = motivosParaRecusar(
      estado({
        concedidas: ["voar", "export_billing"],
        doEditor: new Set<PermissionKey>(["view_all_trips"]),
        administradoresDepois: 0,
        pessoasSemDestino: 2,
      }),
    );
    expect(motivos.sort()).toEqual(
      ["ALEM_DO_PROPRIO_ACESSO", "CARGO_COM_PESSOAS", "PERMISSAO_DESCONHECIDA", "ULTIMO_ADMIN"].sort(),
    );
  });
});
