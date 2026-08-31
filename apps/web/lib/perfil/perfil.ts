import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@brazil-tms/db";
import { iniciaisDe } from "./foto";

/**
 * O CARTÃO DO MINI PERFIL (fatia 029, US2).
 *
 * Uma consulta só, e ela traz o que o cartão desenha: nome, cargo, selos e se a conta ainda está
 * ativa. A foto NÃO vem aqui — ela é uma imagem, e a tela a pede pela rota própria, que devolve um
 * link de curta duração. Embutir a URL assinada nesta resposta faria toda leitura do cartão gerar um
 * link, inclusive para quem nem vai olhar a imagem.
 */
export interface PerfilDeAlguem {
  id: string;
  nome: string;
  cargo: string | null;
  selos: { nome: string; cor: string }[];
  /** Para a tela desenhar o círculo quando não há foto (FR-020). */
  iniciais: string;
  /** Se há foto — a tela só pede a imagem quando existe, e evita um 404 por cartão aberto. */
  temFoto: boolean;
  ativo: boolean;
}

export async function perfilDeAlguem(userId: string): Promise<PerfilDeAlguem | null> {
  const linhas = await db.execute<{
    id: string;
    nome: string;
    status: string;
    cargo: string | null;
    selos: { nome: string; cor: string }[] | null;
    tem_foto: boolean;
  }>(sql`
    select u.id, u.name as nome, u.status,
           c.nome as cargo,
           (select coalesce(json_agg(json_build_object('nome', s.nome, 'cor', s.cor)
                                     order by s.nome), '[]'::json)
              from usuario_selos us join selos s on s.id = us.selo_id
             where us.user_id = u.id) as selos,
           exists (select 1 from resource_documents rd
                    where rd.entity_type = 'user' and rd.entity_id = u.id
                      and rd.doc_type = 'foto_perfil') as tem_foto
      from users u
      left join cargos c on c.id = u.cargo_id
     where u.id = ${userId}
  `);
  const l = linhas[0];
  if (!l) return null;
  return {
    id: l.id,
    nome: l.nome,
    cargo: l.cargo,
    selos: l.selos ?? [],
    iniciais: iniciaisDe(l.nome),
    temFoto: l.tem_foto,
    /*
      CONTA DESATIVADA NÃO SOME — ela volta com `ativo: false` e o cartão diz isso.

      O nome de quem saiu continua no histórico, nos comentários, na auditoria. Um cartão que abre
      vazio nesses lugares faria parecer defeito da tela; dizer "conta desativada" responde a
      pergunta de quem clicou, que é justamente "quem é essa pessoa?".
    */
    ativo: l.status === "active",
  };
}
