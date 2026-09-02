import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O MÉTODO QUE A TELA CHAMA PRECISA EXISTIR NA ROTA (2026-09-02).
 *
 * ── O DEFEITO QUE ESTE GUARDA NASCEU DE ENCONTRAR ─────────────────────────────────────────────
 *
 * `cargos-da-pessoa.tsx` mandava `PATCH` para `/api/admin/users/[id]/cargo`, e a rota só exporta
 * `PUT`. O Next responde **405** a método sem handler; o `catch` da tela virava um "FALHOU" sem
 * nome; e nada era escrito. Durou de 01/09 até 02/09 e chegou como "não consigo atribuir mais de um
 * cargo" — quando na verdade não dava para atribuir nenhum.
 *
 * O que provou foi a AUDITORIA: zero `usuario.cargo_alterado`, embora a escrita audite dentro da
 * mesma transação. Nada no log do app, nada no typecheck, nada na CI. Um verbo HTTP não tem tipo.
 *
 * ── POR QUE ELE LÊ O FONTE ────────────────────────────────────────────────────────────────────
 *
 * O acordo é entre dois arquivos que não se conhecem: um texto `"PUT"` num `fetch` e um `export
 * async function PUT` do outro lado. Não há nada que o compilador possa conferir — só o nome,
 * escrito duas vezes. É a mesma forma do guarda da chave de permissão (`chave-da-decisao.test.ts`),
 * e nasceu do mesmo jeito: um defeito em produção que nenhum portão pegou.
 *
 * ── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────────────────────────
 *
 * Não confere o corpo, nem o formato da resposta, nem se a rota está deployada — 405 em produção
 * também acontece quando a rota existe no repositório e não subiu (ver a memória do projeto sobre o
 * Caddy). Ele cobre só o par verbo↔handler, que é barato e foi o que quebrou.
 */

const WEB = join(__dirname, "../..");

const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

const ler = (caminho: string): string => semComentarios(readFileSync(join(WEB, caminho), "utf8"));

/**
 * Os pares (tela, rota) que este guarda cobre.
 *
 * A lista é explícita em vez de varrer tudo: uma varredura teria de adivinhar qual `fetch` cai em
 * qual arquivo de rota — o caminho é montado com template string —, e um guarda que adivinha erra
 * calado. Acrescente o par quando criar uma tela que escreve.
 */
const PARES = [
  {
    tela: "components/users/cargos-da-pessoa.tsx",
    rota: "app/api/admin/users/[id]/cargo/route.ts",
  },
];

describe("o verbo que a tela usa tem handler na rota", () => {
  for (const { tela, rota } of PARES) {
    it(`\`${tela}\` só chama métodos que \`${rota}\` exporta`, () => {
      const fonteDaRota = ler(rota);
      const exportados = new Set(
        [...fonteDaRota.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(
          (m) => m[1]!,
        ),
      );
      expect(exportados.size, `${rota} não exporta handler nenhum`).toBeGreaterThan(0);

      const usados = [
        ...ler(tela).matchAll(/method:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/g),
      ].map((m) => m[1]!);
      expect(usados.length, `${tela} não faz chamada com método explícito`).toBeGreaterThan(0);

      const semHandler = [...new Set(usados)].filter((m) => !exportados.has(m));
      expect(
        semHandler,
        `${tela} chama ${semHandler.join(", ")} e ${rota} exporta ${[...exportados].join(", ")}. ` +
          "O Next responde 405 e a tela mostra um erro sem nome — foi assim que os cargos " +
          "ficaram um dia inteiro sem poder ser atribuídos.",
      ).toEqual([]);
    });
  }
});
