import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * O PULSO DO TMS (2026-08-19).
 *
 * Esta consulta responde uma pergunta só, e ela não é sobre viagem nenhuma: **o que alimenta este
 * sistema ainda está vivo?**
 *
 * Ela nasceu de uma falha medida. Em 2026-08-18 o robô do portal ficou seis horas sem entregar nada
 * — o token do servidor tinha 23 caracteres e a rota exige 32, então ela recusava tudo com 401. Nada
 * denunciava: o navegador da VM seguia aberto na aba certa, o site no ar, o painel desenhando os
 * mesmos números com a mesma cor. O único sinal vivia num console dentro de uma VM, atrás de VNC.
 *
 * A regra que este arquivo segue: **só devolve carimbo, nunca julgamento**. Se algo está "atrasado"
 * depende da cadência de cada fonte, e cadência é decisão de produto que muda — ela mora na tela
 * (`lib/status/saude.ts`), onde é testável sem banco. Aqui é só "quando foi a última vez".
 */

export interface StatusFonte {
  /** `portal` | `bsc` | `spot` — a tela decide o nome e a régua de cada uma. */
  chave: string;
  /** ISO, ou `null` quando aquela fonte nunca falou. */
  ultimo: string | null;
}

export interface StatusTarefa {
  /** O nome da fila no pg-boss: `sla.sweep`, `documents.checks`, `portal.withdrawn`. */
  nome: string;
  /** Última execução concluída, em ISO. */
  ultimo: string | null;
  /** Quantas falharam nas últimas 24 h — zero é o normal, e qualquer outro número pede alguém. */
  falhas: number;
}

export interface ServerStatus {
  fontes: StatusFonte[];
  tarefas: StatusTarefa[];
  /**
   * A hora DO SERVIDOR quando isto foi medido.
   *
   * A idade não pode ser calculada contra o relógio do navegador: a TV da sala já esteve com a hora
   * errada, e um relógio adiantado transformaria "chegou agora" em "atrasado há três horas". Com o
   * `agora` do servidor viajando junto, a conta é feita entre dois carimbos da mesma máquina.
   */
  agora: string;
}

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

export async function queryServerStatus(): Promise<ServerStatus> {
  /**
   * O `received_at` do BSC, e NÃO o `captured_at` — os dois existem e medem coisas diferentes.
   * `captured_at` é o "Atualizado em" do relatório do cliente, que é a idade do DADO e já aparece no
   * cartão do painel. Aqui a pergunta é outra: o robô falou com a gente? Isso é `received_at`. Um
   * relatório que não republica há dois dias com um robô saudável é normal; trocar os dois faria a
   * tela acusar o robô por uma folga do cliente.
   */
  const [portal, bsc, spot, tarefas] = await Promise.all([
    db.execute<{ ultimo: Date | null }>(sql`SELECT max(portal_last_seen_at) AS ultimo FROM trips`),
    db.execute<{ ultimo: Date | null }>(sql`SELECT max(received_at) AS ultimo FROM bsc_snapshots`),
    db.execute<{ ultimo: Date | null }>(sql`SELECT max(received_at) AS ultimo FROM spot_offers`),
    /**
     * O worker, lido da própria fila do pg-boss.
     *
     * `to_regclass` primeiro porque a tabela pode não existir — banco recém-criado, ambiente de teste
     * sem worker — e uma página de status que explode por não achar o que monitorar é o oposto do que
     * ela existe para fazer. Sem a tabela, a lista sai vazia e a tela diz "sem informação".
     */
    db.execute<{ name: string; ultimo: Date | null; falhas: number }>(sql`
      SELECT name,
             max(completed_on) FILTER (WHERE state = 'completed')          AS ultimo,
             count(*) FILTER (WHERE state = 'failed'
                              AND created_on > now() - interval '24 hours')::int AS falhas
        FROM pgboss.job
       WHERE to_regclass('pgboss.job') IS NOT NULL
       GROUP BY name
       ORDER BY name
    `),
  ]);

  const primeira = (r: { rows?: unknown[] } | unknown[]): Record<string, unknown> | undefined => {
    const linhas = Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? []);
    return linhas[0] as Record<string, unknown> | undefined;
  };
  const todas = (r: { rows?: unknown[] } | unknown[]): Record<string, unknown>[] => {
    const linhas = Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? []);
    return linhas as Record<string, unknown>[];
  };

  return {
    fontes: [
      { chave: "portal", ultimo: iso(primeira(portal)?.ultimo) },
      { chave: "bsc", ultimo: iso(primeira(bsc)?.ultimo) },
      { chave: "spot", ultimo: iso(primeira(spot)?.ultimo) },
    ],
    tarefas: todas(tarefas)
      // `__pgboss__send-it` é encanamento interno da fila, não trabalho nosso. Mostrá-lo só ensina a
      // operação a ignorar linhas que não significam nada.
      .filter((r) => !String(r.name ?? "").startsWith("__pgboss__"))
      .map((r) => ({
        nome: String(r.name ?? ""),
        ultimo: iso(r.ultimo),
        falhas: Number(r.falhas ?? 0),
      })),
    agora: new Date().toISOString(),
  };
}
