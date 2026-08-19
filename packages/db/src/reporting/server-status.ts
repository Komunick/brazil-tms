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

/** Um par (rótulo do portal, status do TMS) e quantas viagens estão nele. A tela decide se combina. */
export interface StatusParPortal {
  portal: string;
  tms: string;
  total: number;
}

export interface ServerStatus {
  fontes: StatusFonte[];
  tarefas: StatusTarefa[];
  /**
   * A tabela cruzada crua — TODOS os pares, não só os divergentes.
   *
   * Quem decide o que combina é `portalStatusAgrees`, no shared, onde a regra é testável sem banco.
   * Mandar só os divergentes daqui poria a regra em SQL também, e a duplicata calada é exatamente o
   * defeito que este projeto já pagou uma vez (`displayStatusSql` × `displayStatusOf`).
   *
   * São ~11 linhas: cabe inteiro na resposta sem pesar.
   */
  paresDoPortal: StatusParPortal[];
  /**
   * Viagens em que o PORTAL já tem motorista e o TMS não conseguiu espelhar.
   *
   * Não é divergência de status — o par (`Assigned`, `received`) é legítimo enquanto o vínculo não
   * acontece. É um número separado porque a ação que ele pede é outra: cadastro faltando, conflito
   * de agenda, alguém para decidir. Ficou invisível o dia inteiro em 2026-08-19, e era o que a
   * operação mais precisava ver.
   */
  atribuicoesPendentes: number;
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
  const [portal, bsc, spot, tarefas, pares, pendentes] = await Promise.all([
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
    // A tabela cruzada. Só viagens que vieram do portal — as digitadas à mão não têm rótulo e não
    // podem divergir de nada.
    db.execute<{ portal: string; tms: string; total: number }>(sql`
      SELECT customer_fields ->> 'Status (portal)' AS portal,
             current_status::text                  AS tms,
             count(*)::int                         AS total
        FROM trips
       WHERE customer_fields ? 'Status (portal)'
       GROUP BY 1, 2
    `),
    /**
     * O portal tem motorista e o TMS não tem atribuição.
     *
     * `Motorista (portal)` preenchido é a prova de que o cliente escalou alguém — mais direto que o
     * rótulo `Assigned`, que também aparece em viagem já espelhada. O `NOT EXISTS` olha a atribuição
     * corrente, que é a mesma que a tela de despacho mostra.
     */
    db.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total
        FROM trips t
       WHERE coalesce(t.customer_fields ->> 'Motorista (portal)', '') <> ''
         AND t.current_status NOT IN ('cancelled', 'completed', 'billing_pending', 'billing_ready', 'billed')
         AND NOT EXISTS (
               SELECT 1 FROM trip_assignments a
                WHERE a.trip_id = t.id AND a.is_current = true)
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
    paresDoPortal: todas(pares).map((r) => ({
      portal: String(r.portal ?? ""),
      tms: String(r.tms ?? ""),
      total: Number(r.total ?? 0),
    })),
    atribuicoesPendentes: Number(primeira(pendentes)?.total ?? 0),
    agora: new Date().toISOString(),
  };
}
