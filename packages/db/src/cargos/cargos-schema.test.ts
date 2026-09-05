import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, ASSIGNABLE_ROLES, ROLE_PERMISSIONS } from "@brazil-tms/shared";

/**
 * A MIGRAÇÃO `0060` É ADITIVA, E ISSO PRECISA CONTINUAR VERDADE.
 *
 * Neste repositório o deploy **não aplica migração** (`docs/OPERACAO.md`): ela roda À MÃO, e nesse
 * momento quem está respondendo em produção é o app ANTERIOR — que lê `users.role` e cria usuário
 * sem saber preencher `cargo_id`.
 *
 * As três linhas que este arquivo proíbe parecem limpeza inofensiva para quem revisar isto daqui a
 * um mês, e cada uma derruba a produção na janela entre a migração e o restart:
 *
 *   `drop column role`              → o app anterior deixa de conseguir montar a sessão
 *   `drop type app_role`            → o mesmo, pela dependência do enum
 *   `alter column cargo_id set not null` → o app anterior não consegue mais criar usuário
 *
 * A remoção de `role` é assunto de uma fatia futura, depois de a produção ter rodado no cargo por um
 * tempo. Se este teste cair, a resposta não é consertar o teste.
 */
const SQL = readFileSync(
  join(__dirname, "../../migrations/0060_cargos_e_perfil.sql"),
  "utf8",
).toLowerCase();

describe("a migração 0060 é aditiva", () => {
  it("NÃO remove `users.role` nem o enum `app_role`", () => {
    expect(SQL).not.toMatch(/drop\s+column\s+(if\s+exists\s+)?role/);
    expect(SQL).not.toMatch(/drop\s+type\s+(if\s+exists\s+)?app_role/);
    expect(SQL).not.toMatch(/drop\s+index\s+(if\s+exists\s+)?users_role_idx/);
  });

  it("NÃO põe `cargo_id` como `not null`", () => {
    // Ele nasce nulo de propósito. Quem sustenta "ninguém fica sem cargo" até o `not null` de uma
    // fatia futura é a APLICAÇÃO: criar usuário exige cargo, apagar cargo exige destino.
    expect(SQL).not.toMatch(/cargo_id[\s\S]{0,40}set\s+not\s+null/);
    expect(SQL).toMatch(/add\s+column\s+cargo_id\s+uuid\s+references/);
  });

  it("cria as quatro tabelas e o índice da pergunta da trava", () => {
    for (const t of ["cargos", "cargo_permissoes", "selos", "usuario_selos"]) {
      expect(SQL).toContain(`create table ${t}`);
    }
    // A trava do último admin pergunta partindo da PERMISSÃO; a PK composta só serve a quem parte do
    // cargo. Sem este índice a pergunta vira varredura — dentro de uma transação, sob concorrência.
    expect(SQL).toContain("create index cargo_permissoes_permissao_idx");
  });

  it("alarga a COLUNA de `resource_documents`, e o teste da PORTA fica em outro lugar", () => {
    // Só o CHECK. `RESOURCE_DOCUMENT_ENTITY_TYPES` — o vocabulário das rotas de frota — continua
    // `driver|vehicle`; alargar as duas faria a rota de frota procurar o pai em `drivers`/`vehicles`
    // e não achar. O comentário em `schema/resource-documents.ts` avisa disso.
    expect(SQL).toMatch(/check \(entity_type in \('driver', 'vehicle', 'preregistration', 'user'\)\)/);
  });
});

/**
 * A SEMEADURA PRECISA SER EXATAMENTE O CATÁLOGO DE HOJE.
 *
 * É daqui que sai a promessa de que ninguém perde acesso na virada (FR-015). O script
 * `029-conferir-acesso.ts` confere contra a produção de verdade; este teste confere contra o
 * catálogo, e é o que roda na CI a cada alteração.
 *
 * Uma capacidade que alguém acrescente a `ROLE_PERMISSIONS` sem acrescentar aqui faz este teste
 * cair — que é o único jeito de descobrir isso antes de uma pessoa reclamar que perdeu um botão.
 */
describe("a semeadura reproduz `ROLE_PERMISSIONS`", () => {
  /**
   * AS MIGRAÇÕES DE SEMEADURA SÃO LIDAS JUNTAS, e a lista vai crescer.
   *
   * A `0060` semeou os cargos a partir de `ROLE_PERMISSIONS`. Toda permissão criada DEPOIS dela
   * precisa da própria migração, porque a 0060 já rodou em produção e não se reescreve.
   *
   * Ler só a primeira faria este teste acusar como ausente uma permissão que EXISTE — ensinando
   * quem vier depois a desconfiar dele, que é o pior estado em que um guarda pode ficar. Aconteceu
   * exatamente assim com `programacao-e-comentario.test.ts`, e o conserto é o mesmo: somar as
   * migrações que participam da semeadura.
   *
   *   0060 — os 7 cargos e as capacidades de cada um (fatia 029)
   *   0063 — `decidir_spot` para o Administrador, e o cargo SPOT (fatia 030)
   *   0066 — `marcar_sm`/`marcar_cte` para quem já marcava, e os cargos GR e Fiscal (fatia 032)
   */
  const original = [
    "0060_cargos_e_perfil",
    "0063_spot_decisao_da_equipe",
    "0066_cargos_gr_e_fiscal",
  ]
    .map((tag) => readFileSync(join(__dirname, `../../migrations/${tag}.sql`), "utf8"))
    .join("\n");

  /**
   * O SQL SEM COMENTÁRIO — e é daqui que os pares saem (2026-09-05).
   *
   * A leitura era feita sobre o arquivo cru, e a `0066` a quebrou: o cabeçalho dela EXPLICA qual
   * padrão este teste procura, escrevendo `where nome = 'X'), 'permissao')` como exemplo. O parser
   * leu o exemplo e passou a acusar um cargo chamado "X".
   *
   * **Este projeto já errou isso três vezes.** As duas primeiras foram asserções casando com a
   * frase que explicava a regra; esta é a mesma coisa do lado de quem LÊ. E o conserto é sempre o
   * mesmo, nunca apagar a explicação: remover comentário antes de olhar.
   *
   * `executavel` já existia mais abaixo, para a asserção de `customer_viewer` — pelo mesmo motivo,
   * e por isso aquela nunca quebrou. Ele sobe para cá e passa a servir aos dois.
   */
  const executavel = original.replace(/--[^\n]*/g, "");

  /** `('Despachante'), 'assign_resources'` → o par que a migração grava. */
  const gravados = new Map<string, Set<string>>();
  for (const par of executavel.matchAll(/where nome = '([^']+)'\), '([a-z_]+)'\)/g)) {
    // Os dois grupos são obrigatórios no padrão, mas o tipo de `matchAll` não sabe disso.
    const nome = par[1]!;
    const permissao = par[2]!;
    if (!gravados.has(nome)) gravados.set(nome, new Set());
    gravados.get(nome)!.add(permissao);
  }

  /** O mesmo mapa nome→papel que a migração usa nos `update`. */
  const PAPEL_DO_CARGO = new Map<string, string>(
    [...executavel.matchAll(/where nome = '([^']+)'\) where role = '([a-z_]+)'/g)].map(
      (m): [string, string] => [m[1]!, m[2]!],
    ),
  );

  it("semeia os sete cargos dos papéis — `customer_viewer` fica de fora", () => {
    /**
     * O enum `app_role` tem oito valores; `ROLE_PERMISSIONS` tem sete. `customer_viewer` está no
     * banco e não está no catálogo: não é papel atribuível (FR-007 da fatia 001) e não vira cargo
     * (FR-017). Semear oito não teria de onde tirar o oitavo.
     *
     * ── E CARGO NOVO NÃO SAI DE PAPEL NENHUM (2026-09-01, fatia 030) ────────────────────────────
     *
     * A conta era `gravados.size === 7`, e ela parou de fechar quando a 0063 semeou o cargo "SPOT".
     * O que a asserção existe para proteger é a EQUIVALÊNCIA com os papéis antigos — que nenhum
     * papel fique sem cargo e que nenhum cargo apareça sem papel de origem. Ela não existe para
     * congelar o número de cargos: o ponto da fatia 029 foi justamente que eles passam a ser
     * criados sem tocar em código.
     *
     * Então a conta muda de forma: os sete papéis continuam tendo cargo, e o que vier além deles é
     * cargo NOVO — cada um com a própria migração, como o SPOT.
     */
    // Todo papel atribuível tem um cargo semeado a partir dele. `PAPEL_DO_CARGO` é o mapa que a
    // própria migração escreve, então esta é a equivalência conferida contra o SQL de verdade.
    const papeisComCargo = new Set(PAPEL_DO_CARGO.values());
    for (const papel of ASSIGNABLE_ROLES) {
      expect(papeisComCargo.has(papel), `${papel} ficou sem cargo`).toBe(true);
    }
    expect(ASSIGNABLE_ROLES).toHaveLength(7);
    /*
      Os cargos semeados ALÉM dos sete, um por um. A lista é explícita de propósito: um cargo que
      aparecesse aqui sem alguém tê-lo escrito seria semeadura que ninguém decidiu.
    */
    const alemDosPapeis = [...gravados.keys()].filter((nome) => !PAPEL_DO_CARGO.has(nome));
    expect(alemDosPapeis.sort()).toEqual(["Fiscal", "GR", "SPOT"]);
    /*
      Conferido no SQL SEM COMENTÁRIOS. O cabeçalho da migração cita `customer_viewer` de propósito,
      para explicar por que ele fica de fora — e uma asserção sobre o arquivo inteiro proibiria
      justamente a explicação que evita alguém "consertar" a contagem para oito mais tarde.
    */
    expect(executavel).not.toContain("customer_viewer");
  });

  it("cada cargo recebe EXATAMENTE as capacidades do papel equivalente", () => {
    expect(PAPEL_DO_CARGO.size).toBe(7);
    for (const [nome, papel] of PAPEL_DO_CARGO) {
      const esperado = [...ROLE_PERMISSIONS[papel as (typeof ASSIGNABLE_ROLES)[number]]].sort();
      const gravado = [...(gravados.get(nome) ?? [])].sort();
      expect({ nome, permissoes: gravado }).toEqual({ nome, permissoes: esperado });
    }
  });

  it("ninguém sai da migração sem cargo — há um destino para o que o catálogo não cobre", () => {
    /**
     * ACHADO PELA SIMULAÇÃO, e não por teste (31/08). Rodada a migração no banco de dev dentro de
     * uma transação desfeita, **uma pessoa ficava com `cargo_id` nulo**: ela tem
     * `role = 'customer_viewer'`, que está no enum `app_role` e NÃO está em `ROLE_PERMISSIONS` —
     * então nenhum dos sete `update` a alcançava. Produção tem uma linha igual.
     *
     * O cargo "Sem acesso" é VAZIO, e vazio é exatamente o que essa pessoa alcança hoje: `can` faz
     * `ROLE_PERMISSIONS[role]?.has(...) ?? false`, e para papel fora do catálogo isso é false para
     * tudo. Não é `customer_viewer` virando cargo (FR-017 segue valendo) — é o comportamento atual,
     * agora dito em voz alta.
     *
     * A rede final (`where cargo_id is null`) é o que faz o FR-011 valer para toda linha da tabela,
     * e não só para as que alguém soube antecipar.
     */
    expect(original).toContain("('Sem acesso')");
    expect(original).toMatch(
      /update users set cargo_id = \(select id from cargos where nome = 'Sem acesso'\) where cargo_id is null;/,
    );
    // A rede vem DEPOIS dos sete: antes deles, varreria todo mundo para "Sem acesso".
    expect(original.indexOf("where cargo_id is null")).toBeGreaterThan(
      original.lastIndexOf("where role = 'executive_viewer'"),
    );
    // E ela não concede nada: "Sem acesso" não aparece em nenhum insert de permissão.
    expect(original).not.toMatch(/where nome = 'Sem acesso'\), '[a-z_]+'\)/);
  });

  it("o cargo de administrador recebe o catálogo INTEIRO", () => {
    // É este cargo que a conta mestre herda (FR-017a). Um só faltando aqui e a pessoa que precisa
    // consertar o acesso dos outros é a primeira a ficar sem.
    const admin = [...PAPEL_DO_CARGO].find(([, papel]) => papel === "admin")?.[0];
    expect(admin).toBeDefined();
    expect([...gravados.get(admin!)!].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});
