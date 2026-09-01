import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { cargoPermissoes, cargos, users } from "../../schema";
import { writeAudit } from "../audit/write-audit";
import { SemAdministrador, quantosAindaAdministram } from "./ainda-tem-admin";

/**
 * A ESCRITA DOS CARGOS — o ÚNICO lugar que chama a trava do último administrador (fatia 029).
 *
 * ── TODA MUTAÇÃO SEGUE A MESMA FORMA ──────────────────────────────────────────────────────────
 *
 *   1. lê o estado ANTES (é o `previous_value` da auditoria, e ele guarda a lista INTEIRA)
 *   2. escreve
 *   3. reconta quantas pessoas ainda administram — e desfaz tudo se for zero
 *   4. audita
 *
 * O passo 3 vem DEPOIS do 2 de propósito. O porquê está em `ainda-tem-admin.ts`: contar antes perde
 * a corrida de duas abas rebaixando um administrador cada.
 *
 * ── O `previous_value` GUARDA A LISTA INTEIRA, NÃO A DIFERENÇA ────────────────────────────────
 *
 * Guardar só o que mudou obriga quem investiga a somar todas as alterações desde o começo para saber
 * o que valia num dia — e essa é exatamente a pergunta que se faz depois de um incidente (FR-026).
 */

/**
 * O estado de um cargo, do jeito que a auditoria o guarda.
 *
 * `type` e não `interface`: o `previousValue` da auditoria é `Record<string, unknown>`, e uma
 * `interface` não satisfaz assinatura de índice — a mesma pegadinha do `Linha` no script de
 * conferência.
 */
type RetratoDoCargo = {
  nome: string;
  ativo: boolean;
  permissoes: string[];
};

async function retrato(
  tx: typeof db,
  cargoId: string,
): Promise<RetratoDoCargo | null> {
  const linhas = await tx.execute<{ nome: string; ativo: boolean; permissoes: string[] }>(sql`
    select c.nome, c.ativo,
           coalesce((select array_agg(cp.permissao order by cp.permissao)
                       from cargo_permissoes cp where cp.cargo_id = c.id), '{}') as permissoes
      from cargos c where c.id = ${cargoId}
  `);
  const l = linhas[0];
  return l ? { nome: l.nome, ativo: l.ativo, permissoes: l.permissoes ?? [] } : null;
}

export async function criarCargo(nome: string, autorId: string): Promise<string> {
  return db.transaction(async (tx) => {
    const [linha] = await tx.insert(cargos).values({ nome }).returning({ id: cargos.id });
    const id = linha!.id;
    /*
      Nasce SEM capacidade nenhuma, e a tela avisa antes de salvar. É o certo: um cargo que nascesse
      com algo marcado concederia acesso que ninguém pediu, e é mais fácil marcar do que descobrir
      que se concedeu sem querer.
    */
    await writeAudit(tx, {
      entityType: "cargo",
      entityId: id,
      action: "cargo.criado",
      previousValue: null,
      newValue: { nome, ativo: true, permissoes: [] },
      actorUserId: autorId,
    });
    return id;
  });
}

/**
 * Grava o ESTADO FINAL do cargo: nome, se está ativo, e a lista inteira de capacidades.
 *
 * Sem `add`/`remove` — a última gravação vence, como no resto do sistema. Duas abas somando escolhas
 * que ninguém fez é pior que uma sobrescrever a outra de forma previsível.
 */
export async function gravarCargo(
  cargoId: string,
  proximo: { nome: string; ativo: boolean; permissoes: string[] },
  autorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const antes = await retrato(tx as typeof db, cargoId);
    if (!antes) throw new Error("CARGO_NAO_ENCONTRADO");

    await tx
      .update(cargos)
      .set({ nome: proximo.nome, ativo: proximo.ativo, atualizadoEm: new Date() })
      .where(eq(cargos.id, cargoId));

    await tx.delete(cargoPermissoes).where(eq(cargoPermissoes.cargoId, cargoId));
    if (proximo.permissoes.length > 0) {
      await tx
        .insert(cargoPermissoes)
        .values(proximo.permissoes.map((permissao) => ({ cargoId, permissao })));
    }

    // DEPOIS da escrita — ver `ainda-tem-admin.ts`.
    if ((await quantosAindaAdministram(tx as never)) < 1) throw new SemAdministrador();

    await writeAudit(tx, {
      entityType: "cargo",
      entityId: cargoId,
      action: "cargo.alterado",
      previousValue: antes,
      newValue: proximo,
      actorUserId: autorId,
    });
  });
}

/**
 * Desativa um cargo — **não apaga** (princípio III). Move quem estiver dentro, se houver destino.
 *
 * Apagar levaria junto o histórico de auditoria de quem esteve nele, que é justamente o que responde
 * "por que fulano conseguia cancelar viagem em março?".
 */
export async function desativarCargo(
  cargoId: string,
  moverPara: string | null,
  autorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const antes = await retrato(tx as typeof db, cargoId);
    if (!antes) throw new Error("CARGO_NAO_ENCONTRADO");

    /*
      MOVER É ACRESCENTAR O NOVO, e não trocar (2026-09-01).

      Com um cargo por pessoa, "mover" era um `update` do vínculo único. Com vários, trocar apagaria
      os OUTROS cargos de quem estava neste — alguém do GR que também cuidava do spot perderia o GR
      ao se desativar o cargo SPOT, que é o oposto do que "mover para outro cargo" promete.

      O vínculo com o cargo desativado FICA. Ele não concede nada (a leitura da sessão exige
      `c.ativo`), e apagá-lo levaria junto a resposta para "quem estava neste cargo em março?".
    */
    if (moverPara) {
      await tx.execute(sql`
        insert into usuario_cargos (user_id, cargo_id)
        select uc.user_id, ${moverPara}::uuid
          from usuario_cargos uc where uc.cargo_id = ${cargoId}
        on conflict do nothing
      `);
    }
    await tx
      .update(cargos)
      .set({ ativo: false, atualizadoEm: new Date() })
      .where(eq(cargos.id, cargoId));

    if ((await quantosAindaAdministram(tx as never)) < 1) throw new SemAdministrador();

    await writeAudit(tx, {
      entityType: "cargo",
      entityId: cargoId,
      action: "cargo.desativado",
      previousValue: antes,
      newValue: { ...antes, ativo: false, moveuPara: moverPara },
      actorUserId: autorId,
    });
  });
}

/**
 * Move uma pessoa de cargo (FR-009) — e é um dos quatro caminhos da trava.
 *
 * A mudança vale na PRÓXIMA REQUISIÇÃO dessa pessoa, sem ela sair e entrar: a sessão lê o banco a
 * cada requisição, e nunca leu de um token.
 */
export async function definirCargosDaPessoa(
  userId: string,
  cargoIds: string[],
  autorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const antes = await tx.execute<{ cargo_id: string }>(sql`
      select cargo_id from usuario_cargos where user_id = ${userId} order by cargo_id
    `);

    /*
      SUBSTITUI O CONJUNTO INTEIRO — apaga e insere, dentro da transação.

      A alternativa era calcular o que entrou e o que saiu e mexer só nisso. Ela erra de um jeito
      silencioso: qualquer vínculo que a tela não conhecesse (criado por outra aba, por exemplo)
      sobreviveria à edição, e a pessoa ficaria com um acesso que ninguém marcou.

      Trocar o conjunto faz a tela ser a verdade — e é o que "estes são os cargos dela" quer dizer.
    */
    await tx.execute(sql`delete from usuario_cargos where user_id = ${userId}`);
    if (cargoIds.length > 0) {
      await tx.execute(sql`
        insert into usuario_cargos (user_id, cargo_id)
        select ${userId}::uuid, c.id from cargos c
         where c.id = any(${sql.raw(`ARRAY[${cargoIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})
           and c.ativo
      `);
    }

    /*
      `users.cargo_id` CONTINUA SENDO ESCRITO, e não decide mais nada.

      O deploy migra antes do build, e durante a construção o app ANTERIOR ainda lê esta coluna para
      montar a sessão. Deixá-la desatualizada nesses minutos tiraria o acesso de quem fosse editado
      justo aí. Ela guarda o PRIMEIRO cargo — arbitrário de propósito, porque é um valor de
      compatibilidade, não uma escolha. Sai numa fatia futura.
    */
    await tx
      .update(users)
      .set({ cargoId: cargoIds[0] ?? null })
      .where(eq(users.id, userId));

    // Depois da escrita, dentro da transação: contar antes perde a corrida de duas abas.
    if ((await quantosAindaAdministram(tx as never)) < 1) throw new SemAdministrador();

    await writeAudit(tx, {
      entityType: "user",
      entityId: userId,
      action: "usuario.cargo_alterado",
      previousValue: { cargoIds: antes.map((l) => l.cargo_id) },
      newValue: { cargoIds },
      actorUserId: autorId,
    });
  });
}

/** Quantas pessoas ATIVAS estão num cargo — o que decide se apagar exige destino (FR-011). */
export async function quantasPessoasNoCargo(cargoId: string): Promise<number> {
  const linhas = await db.execute<{ n: number }>(sql`
    select count(*)::int as n
      from usuario_cargos uc
      join users u on u.id = uc.user_id
     where uc.cargo_id = ${cargoId} and u.status = 'active'
  `);
  return linhas[0]?.n ?? 0;
}

/** Confere que os ids existem e estão ativos — usado antes de mover em lote. */
export async function cargosAtivos(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const linhas = await db
    .select({ id: cargos.id })
    .from(cargos)
    .where(and(inArray(cargos.id, ids), eq(cargos.ativo, true)));
  return new Set(linhas.map((l) => l.id));
}
