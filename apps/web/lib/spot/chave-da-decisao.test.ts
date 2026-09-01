import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A TELA E O SERVIDOR PRECISAM CHAMAR A MESMA CHAVE (2026-09-01).
 *
 * ── O DEFEITO QUE ESTE GUARDA NASCEU DE ENCONTRAR ─────────────────────────────────────────────
 *
 * As duas rotas do spot exigem `decidir_spot`. Os dois lugares que montam a camada perguntavam por
 * `assign_resources`. Ninguém percebeu por meses porque quem construiu e quem testou eram
 * administradores, e o cargo Administrador tem as duas.
 *
 * Medido na produção antes da correção: **18 pessoas** — 17 do cargo Despachante e 1 de Gerente de
 * operações — tinham `assign_resources` e não tinham `decidir_spot`. Para elas os botões Aceitar e
 * Ignorar apareciam LIGADOS, e o clique voltava 403. Um botão ausente informa; um botão ligado que
 * falha faz a pessoa achar que pegou o frete.
 *
 * ── POR QUE ELE LÊ O FONTE ────────────────────────────────────────────────────────────────────
 *
 * O que precisa ser garantido é um ACORDO entre quatro arquivos que nunca se importam entre si. Não
 * há valor de retorno, tipo ou execução que ligue a permissão que o layout consulta à que a rota
 * exige — só o nome, escrito duas vezes. Um teste de comportamento precisaria de uma sessão real de
 * cada cargo para descobrir a divergência, que é justamente o que não acontece na prática.
 *
 * ── COMENTÁRIO SAI ANTES DE ASSEVERAR, e aqui não é teoria ────────────────────────────────────
 *
 * O comentário que o layout ganhou nesta mesma correção CITA `assign_resources` para contar o que
 * deu errado. Sem a limpeza, este guarda acusaria a explicação do defeito como se fosse o defeito —
 * e "consertá-lo" seria apagar o porquê. Já aconteceu quatro vezes nesta base.
 */

const WEB = join(__dirname, "../..");

const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const ler = (caminho: string): string => semComentarios(readFileSync(join(WEB, caminho), "utf8"));

/** A chave que as rotas EXIGEM. É ela quem manda: o servidor é onde a decisão vale. */
const CHAVE = "decidir_spot";

/** Onde a camada é montada — os dois lugares, e a TV não é exceção (decisão do usuário). */
const TELAS = ["app/(shell)/layout.tsx", "app/(wall)/painel/page.tsx"];

/** Onde a decisão é cobrada de verdade. */
const ROTAS = [
  "app/api/spot-offers/[id]/dispensar/route.ts",
  "app/api/trips/[id]/portal-action/route.ts",
];

describe("quem decide o spot é a mesma chave na tela e no servidor", () => {
  for (const rota of ROTAS) {
    it(`a rota \`${rota}\` cobra \`${CHAVE}\``, () => {
      expect(
        ler(rota),
        `${rota} deixou de exigir \`${CHAVE}\` — se a chave mudou, mude também as telas de ${TELAS.join(" e ")}`,
      ).toContain(`"${CHAVE}"`);
    });
  }

  for (const tela of TELAS) {
    it(`a tela \`${tela}\` pergunta por \`${CHAVE}\`, e por mais nenhuma`, () => {
      const fonte = ler(tela);

      /*
        O `podeDecidir` de cada montagem, com a permissão que ele consulta dentro. Casa tanto
        `permissoes.has("x")` quanto `can(session.user, "x")` — as duas formas em uso.
      */
      const trecho = /podeDecidir=\{([^}]*)\}/.exec(fonte)?.[1];
      expect(trecho, `${tela} parou de passar \`podeDecidir\` — a camada ficaria sem dono`).toBeTruthy();

      const chaves = [...(trecho ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
      expect(
        chaves,
        `${tela} decide o spot por ${chaves.join(", ") || "nenhuma permissão"} — foi assim que 18 ` +
          "pessoas passaram a ver o botão ligado e a tomar 403 no clique.",
      ).toEqual([CHAVE]);
    });
  }

  /**
   * A CHAVE PRECISA EXISTIR NO CATÁLOGO — senão o guarda acima concordaria consigo mesmo sobre um
   * nome que ninguém pode ter, e todo mundo ficaria sem botão, silenciosamente.
   */
  it("a chave existe no catálogo de acesso", () => {
    expect(ler("lib/auth/catalogo-de-acesso.ts")).toContain(CHAVE);
  });
});
