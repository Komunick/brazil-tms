import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { SETORES, TURNOS } from "@brazil-tms/shared";
import {
  CONTADORES_APURADOS,
  chavesCalculadasNoCatalogo,
  horasDaJanela,
  janelaDoTurno,
} from "./bloco";

/**
 * O CATÁLOGO NÃO PODE PROMETER O QUE O CÓDIGO NÃO APURA (2026-08-26).
 *
 * ── O DEFEITO QUE ISTO EVITA ──────────────────────────────────────────────────────────────────
 *
 * Um contador marcado `calculado` no catálogo aparece na tela como número do sistema — sem campo
 * para digitar, com a autoridade de coisa medida. Se `contadoresApurados` não devolver aquela
 * chave, a tela mostra ZERO.
 *
 * E zero é a pior saída possível aqui. Não é um espaço em branco que faz alguém perguntar; é uma
 * afirmação. "Nenhum no show neste turno" lido de um resumo é motivo para não olhar, e o erro só
 * apareceria quando alguém agisse em cima dele — provavelmente no turno seguinte, longe da causa.
 *
 * Foi exatamente esse o engano da primeira versão deste catálogo: quinze contadores marcados como
 * calculados por otimismo, dos quais só quatro tinham dado confiável atrás.
 *
 * ── POR QUE O TESTE VIVE AQUI E NÃO NO PACOTE COMPARTILHADO ───────────────────────────────────
 *
 * Porque ele cruza DUAS declarações que moram em pacotes diferentes: a promessa (o catálogo, em
 * `@brazil-tms/shared`) e a entrega (`contadoresApurados`, aqui). Só este lado enxerga os dois.
 */
describe("todo contador `calculado` tem apuração de verdade", () => {
  it("nenhuma chave calculada fica sem implementação", () => {
    const semImplementacao: string[] = [];
    for (const setor of SETORES) {
      for (const turno of TURNOS) {
        for (const chave of chavesCalculadasNoCatalogo(setor, turno)) {
          if (!CONTADORES_APURADOS.includes(chave)) {
            semImplementacao.push(`${setor}/${turno}/${chave}`);
          }
        }
      }
    }
    expect(semImplementacao).toEqual([]);
  });

  /**
   * O lado oposto: apurar uma chave que o catálogo diz ser digitada é trabalho jogado fora — a
   * tela nunca mostraria o número, e a consulta rodaria a cada leitura do bloco sem que ninguém
   * visse o resultado.
   */
  it("nenhuma apuração fica sem chave correspondente no catálogo", () => {
    const declaradas = new Set(
      SETORES.flatMap((setor) =>
        TURNOS.flatMap((turno) => chavesCalculadasNoCatalogo(setor, turno)),
      ),
    );
    for (const chave of CONTADORES_APURADOS) {
      expect(
        declaradas.has(chave),
        `${chave} é apurado mas o catálogo não o marca como calculado`,
      ).toBe(true);
    }
  });

  /**
   * Hoje os quatro são todos da Programação. Este teste não trava isso — trava a CONTA: se alguém
   * promover um contador sem implementar, ou implementar sem promover, os dois testes acima pegam.
   * Este aqui só documenta o número atual, para que uma mudança seja consciente.
   */
  it("são quatro apurações hoje, todas da Programação", () => {
    expect(CONTADORES_APURADOS).toHaveLength(4);
    expect(chavesCalculadasNoCatalogo("PROGRAMACAO", "T1")).toEqual([...CONTADORES_APURADOS]);
    for (const setor of SETORES) {
      if (setor === "PROGRAMACAO") continue;
      for (const turno of TURNOS) {
        expect(chavesCalculadasNoCatalogo(setor, turno), setor).toEqual([]);
      }
    }
  });
});

/**
 * A JANELA DO TURNO EM SQL — o defeito que só a Programação mostrava (2026-08-27).
 *
 * ── O QUE ACONTECEU ───────────────────────────────────────────────────────────────────────────
 *
 * A janela do T2 era montada como `data::date + 1 + '7 hours'::interval`, para dizer "sete da manhã
 * do dia seguinte". Aquele `+ 1` vira um PARÂMETRO SEM TIPO no SQL gerado, e `date + $n` é ambíguo
 * para o Postgres — existem `date + integer`, `date + interval`, `date + time` e `date + timetz`.
 * Ele não escolhe: recusa a consulta.
 *
 * Falhava nos DOIS turnos, sempre. Mas como a apuração só existe para a PROGRAMAÇÃO — os outros
 * quatro setores devolvem `{}` sem consultar —, só aquela aba quebrava. Parecia defeito de tela.
 *
 * ── POR QUE ESTE TESTE NÃO PRECISA DE BANCO ───────────────────────────────────────────────────
 *
 * O erro está no TEXTO da consulta, e o `PgDialect` monta esse texto sem conexão nenhuma. É o mesmo
 * caminho que já pegou a serialização de `Date` em `logae-positions`: defeito de SQL gerado se prova
 * offline, e o teste roda na CI, que não tem Postgres.
 */
describe("a janela do turno em SQL", () => {
  const d = new PgDialect();

  /**
   * A INVARIANTE QUE PEGA O DEFEITO: nenhum parâmetro solto.
   *
   * Todo `$n` desta expressão alimenta aritmética de data, onde o Postgres não infere tipo sozinho.
   * Exigir que cada um venha seguido de `::` é a regra mais simples que descreve isso — e é
   * exatamente o que faltava no `+ 1`. Conferido contra a expressão antiga: ela acusa `$2`.
   */
  for (const turno of TURNOS) {
    it(`${turno}: todo parâmetro carrega cast explícito`, () => {
      for (const ponta of ["inicio", "fim"] as const) {
        const { sql: texto } = d.sqlToQuery(janelaDoTurno("2026-08-26", turno)[ponta]);
        const semCast = texto.match(/\$\d+(?!::)/g) ?? [];
        expect(semCast, `${turno}/${ponta}: ${texto}`).toEqual([]);
      }
    });
  }

  /**
   * E a aritmética continua certa depois da troca — que é o risco de dobrar o dia dentro das horas:
   * ficaria fácil somar 24 no turno errado, e aí a janela do diurno pegaria doze horas do noturno
   * sem que nada acusasse.
   */
  it("o T1 vai das 7h às 19h do mesmo dia", () => {
    expect(horasDaJanela("T1")).toEqual({ inicio: 7, fim: 19 });
  });

  it("o T2 vai das 19h às 7h do DIA SEGUINTE — 31 horas da meia-noite", () => {
    expect(horasDaJanela("T2")).toEqual({ inicio: 19, fim: 31 });
  });

  /** Janela invertida ou vazia não selecionaria viagem nenhuma, e o contador daria zero calado. */
  it("o fim vem sempre depois do início, nos dois turnos", () => {
    for (const turno of TURNOS) {
      const { inicio, fim } = horasDaJanela(turno);
      expect(fim, turno).toBeGreaterThan(inicio);
    }
  });

  /** As doze horas de cada turno, que somadas fecham o dia — se uma encolher, algo se perdeu. */
  it("cada turno cobre doze horas, e os dois somam o dia inteiro", () => {
    const duracoes = TURNOS.map((t) => {
      const { inicio, fim } = horasDaJanela(t);
      return fim - inicio;
    });
    expect(duracoes).toEqual([12, 12]);
  });

  /** A data viaja como TEXTO até o Postgres — virar `Date` no caminho traz o fuso de volta. */
  it("a data vai como AAAA-MM-DD, nunca como Date", () => {
    const { params } = d.sqlToQuery(janelaDoTurno("2026-08-26", "T2").inicio);
    expect(params).toContain("2026-08-26");
    for (const p of params) expect(p).not.toBeInstanceOf(Date);
  });
});
