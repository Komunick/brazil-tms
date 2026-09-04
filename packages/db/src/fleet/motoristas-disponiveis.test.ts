import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A FONTE DA ABA DE MOTORISTAS DISPONÍVEIS (fatia 031, 03/09).
 *
 * ── POR QUE ESTE TESTE LÊ O CÓDIGO-FONTE ──────────────────────────────────────────────────────
 *
 * A função consulta o banco; provar o comportamento exigiria subir Postgres com viagens dos dois
 * tipos. O defeito real que ameaça esta fatia é outro, é de intenção, e é barato de pegar aqui:
 * alguém "simplificar" a consulta para partir de `trip_assignments`, que parece a fonte óbvia de
 * quem está dirigindo.
 *
 * Medido em 03/09, e é por isso que a fonte óbvia está errada:
 *
 *   · **49 viagens de 760** têm motorista no portal e nenhuma atribuição nossa (o inverso é zero) —
 *     **67 motoristas invisíveis** na janela desta aba;
 *   · **18 de 406 pares** apontam para outra PESSOA, e em todos os 18 o id do portal resolve para o
 *     nome do portal: a atribuição nossa é a versão velha de uma viagem reatribuída lá.
 *
 * A "simplificação" passaria no typecheck, passaria em todo teste existente, e o sintoma seria
 * silencioso: motorista em viagem aparecendo como livre, e motorista livre não aparecendo.
 */
const fonte = readFileSync(join(__dirname, "motoristas-disponiveis.ts"), "utf8")
  /*
    COMENTÁRIO SAI ANTES DA ASSERÇÃO.

    Este projeto já errou isto duas vezes: a asserção casava com a frase que EXPLICA a regra, e o
    "conserto" natural era apagar o porquê. Aqui o cabeçalho fala de `trip_assignments` justamente
    para dizer que ela NÃO é a fonte — a explicação derrubaria o teste que ela justifica.
  */
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1 ");

describe("a fonte de quem está dirigindo", () => {
  it("parte do PORTAL — id do motorista casado com o cadastro", () => {
    expect(
      fonte,
      "a consulta deixou de casar pelo id do portal — 67 motoristas somem da aba",
    ).toContain("portal_driver_id");
    expect(fonte).toContain("ID do motorista (portal)");
  });

  /**
   * A atribuição nossa pode ficar — mas SÓ dentro do `coalesce`, como complemento para a viagem que
   * o TMS acabou de atribuir e o portal ainda não refletiu. Se ela virar a origem principal, os 18
   * pares divergentes passam a mandar, e a aba descreve a pessoa errada.
   */
  it("a atribuição nossa entra como COMPLEMENTO, dentro de um coalesce", () => {
    expect(fonte, "a atribuição virou a fonte principal").toContain("coalesce(dp.id, a.driver_id)");
  });

  it("a última viagem é a que CHEGA POR ÚLTIMO, com desempate estável", () => {
    // 23 motoristas têm mais de uma viagem aberta ao mesmo tempo. Ordenar por criação, ou pegar "a
    // única aberta", descreve a viagem errada e chama de livre quem já tem a próxima carga.
    // O desempate por `trip_id` é o que torna a lista estável entre leituras (I5).
    expect(fonte, "a data deixou de ordenar da mais distante para a mais próxima").toContain(
      "conclusao desc",
    );
    // O `trip_id` é o ÚLTIMO critério, e é ele que torna a lista estável entre leituras: sem
    // desempate, duas viagens empatadas alternariam a cada polling — um piscar inexplicável.
    expect(fonte, "o desempate estável saiu").toMatch(/trip_id\s*$/m);
  });

  /**
   * VIAGEM ABERTA GANHA DE VIAGEM TERMINADA — e isto foi achado SIMULANDO, não testando.
   *
   * A regra "a última é a que chega por último" estava sendo obedecida, e mesmo assim **dois
   * motoristas apareceriam como livres estando na estrada**: a última deles pela data era uma
   * viagem CANCELADA que chegaria mais tarde, e a viagem `in_transit` que eles rodavam de fato
   * chegava antes. Cancelada conta como livre — a aba diria que quem está dirigindo pode pegar
   * carga.
   *
   * Tirar esta ordenação não quebra nenhum outro teste, e é por isso que ela precisa de um guarda:
   * ela parece um detalhe de `order by` e é a diferença entre a aba estar certa e mentir.
   */
  /**
   * CANCELADA NÃO ENTRA NA ABA (usuário, 03/09: "canceladas pode ignorar").
   *
   * Tirá-la resolve pela raiz o caso do `in_transit` atropelado E corrige nove linhas: eram nove
   * motoristas cuja cancelada estava na frente de uma viagem concluída de verdade. Deixá-la voltar
   * traz os dois problemas juntos, e nenhum deles dá erro.
   */
  it("a cancelada é filtrada na varredura, e não rotulada depois", () => {
    expect(fonte, "a cancelada voltou para a aba").toContain("current_status <> 'cancelled'");
  });

  it("viagem ABERTA ganha de viagem concluída na escolha da última", () => {
    expect(
      fonte,
      "a concluída voltou a poder atropelar a viagem em andamento — quem dirige vira 'livre'",
    ).toContain("(status = 'completed') asc");
  });

  /**
   * A VARREDURA NÃO É A JANELA (armadilha 7). Ela existe para achar a última viagem ANTES do
   * recorte; varrer só a janela faria a "última" ser a última dentro dela, e um motorista com viagem
   * futura apareceria como livre.
   */
  it("varre para trás sem recortar a janela no SQL", () => {
    expect(fonte).toContain("DIAS_DE_VARREDURA");
    expect(
      fonte,
      "o recorte de hoje/amanhã foi para o SQL — a regra testável deixou de ser a que manda",
    ).toContain("cabeNaAba(");
  });

  it("reusa o separador de placa que já existe, em vez de escrever outro", () => {
    expect(fonte).toContain("placasDoPortal");
    expect(fonte, "apareceu um segundo separador de placa").not.toMatch(/\.split\(/);
  });
});

/**
 * NENHUMA ESCRITA (invariante I1).
 *
 * A fatia inteira é leitura. "Disponível" não é dado nosso, é conclusão — e guardá-lo criaria uma
 * segunda verdade que diverge do portal em silêncio, que é o erro que a fatia 030 documentou.
 */
describe("a leitura não escreve", () => {
  it("não tem verbo de escrita nenhum", () => {
    for (const verbo of ["insert", "update", "delete", "db.insert", "db.update", "db.delete"]) {
      expect(
        fonte.toLowerCase(),
        `apareceu \`${verbo}\` numa fatia que é só leitura`,
      ).not.toContain(verbo);
    }
  });

  it("não guarda 'disponível' em coluna nenhuma", () => {
    // I2: se a palavra virar campo de tabela, a cópia começou a divergir do portal.
    expect(fonte).not.toMatch(/set\s*\(\s*\{/);
  });
});
