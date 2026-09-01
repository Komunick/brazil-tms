import { sql } from "drizzle-orm";
import { db } from "../client";

/**
 * A LEITURA DA TELA DE CARGOS (fatia 029, FR-008).
 *
 * A contagem de pessoas vem JUNTO da lista, e não de uma chamada por cargo: ela é a informação que
 * muda a decisão de quem edita. Desativar um cargo com catorze pessoas dentro é outra conversa —
 * e descobrir isso só depois de clicar é descobrir tarde.
 */

export interface CargoNaLista {
  id: string;
  nome: string;
  ativo: boolean;
  /** Quantas pessoas **ativas** estão neste cargo. Desativado não conta: não entra no sistema. */
  pessoas: number;
  /** As capacidades concedidas, na ordem do catálogo — a tela decide como agrupar. */
  permissoes: string[];
}

export async function listarCargos(): Promise<CargoNaLista[]> {
  const linhas = await db.execute<{
    id: string;
    nome: string;
    ativo: boolean;
    pessoas: number;
    permissoes: string[];
  }>(sql`
    select c.id, c.nome, c.ativo,
           (select count(*)::int from usuario_cargos uc
              join users u on u.id = uc.user_id
             where uc.cargo_id = c.id and u.status = 'active')
             as pessoas,
           coalesce(
             (select array_agg(cp.permissao order by cp.permissao)
                from cargo_permissoes cp where cp.cargo_id = c.id),
             '{}'
           ) as permissoes
      from cargos c
     order by c.ativo desc, c.nome
  `);
  return linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    ativo: l.ativo,
    pessoas: l.pessoas,
    permissoes: l.permissoes ?? [],
  }));
}

/** As pessoas de um cargo — o que a tela mostra antes de perguntar para onde elas vão. */
export async function pessoasDoCargo(cargoId: string): Promise<{ id: string; nome: string }[]> {
  const linhas = await db.execute<{ id: string; nome: string }>(sql`
    select u.id, u.name as nome
      from users u
     where u.id in (select uc.user_id from usuario_cargos uc where uc.cargo_id = ${cargoId})
       and u.status = 'active'
     order by u.name
  `);
  return linhas;
}
