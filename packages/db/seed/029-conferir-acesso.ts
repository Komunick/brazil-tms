import "dotenv/config";
import { sql } from "drizzle-orm";
import { ROLE_PERMISSIONS, type Role } from "@brazil-tms/shared";
import { db } from "../src";

/**
 * A PROVA DE QUE NINGUÉM PERDE ACESSO NA VIRADA (FR-015 · SC-003 · fatia 029).
 *
 * Para cada pessoa, monta dois conjuntos e compara:
 *
 *   ANTES   `ROLE_PERMISSIONS[users.role]`          — o catálogo em código, que manda hoje
 *   DEPOIS  `users.cargo_id → cargo_permissoes`     — as tabelas novas, que vão mandar
 *
 * ── POR QUE ISTO EXISTE COMO SCRIPT, E NÃO COMO TESTE ─────────────────────────────────────────
 *
 * O teste (`cargos-schema.test.ts`) confere a semeadura contra o CATÁLOGO, e é o que roda na CI.
 * Este script confere contra as PESSOAS DE VERDADE, no banco de verdade — e é a única forma de
 * responder "as 34 continuam com o que tinham?" antes de publicar qualquer código.
 *
 * ── QUANDO RODAR ──────────────────────────────────────────────────────────────────────────────
 *
 * DEPOIS de aplicar a migração `0060` à mão, e ANTES de publicar o app que lê o cargo. Primeiro no
 * dev, e só então em produção. Nessa janela a migração já semeou e `users.role` ainda é quem manda —
 * então uma divergência aqui não exige desfazer NADA: conserta-se a semeadura e roda de novo.
 *
 *   pnpm --filter @brazil-tms/db db:conferir-acesso
 *
 * É LEITURA PURA. Não escreve uma linha.
 */

/**
 * O papel que não está no catálogo alcança VAZIO — e isto não é tratamento de erro.
 *
 * `can` faz `ROLE_PERMISSIONS[role]?.has(...) ?? false`. Para um valor do enum que não está no
 * catálogo — `customer_viewer` é o caso real, e há uma linha assim em produção — isso é false para
 * toda capacidade. Reproduzir aqui a mesma conta é o que faz a comparação ser honesta, em vez de
 * acusar uma divergência que não existe.
 */
function capacidadesDeHoje(papel: string): string[] {
  return [...(ROLE_PERMISSIONS[papel as Role] ?? new Set<string>())].sort();
}

/** `db.execute` exige assinatura de índice — o `type` a satisfaz onde a `interface` não satisfaz. */
type Linha = {
  email: string;
  nome: string;
  papel: string;
  status: string;
  cargo: string | null;
  permissoes: string[] | null;
};

async function main(): Promise<void> {
  const linhas = await db.execute<Linha>(sql`
    select u.email,
           u.name  as nome,
           u.role::text as papel,
           u.status,
           c.nome  as cargo,
           coalesce(
             (select array_agg(cp.permissao order by cp.permissao)
                from cargo_permissoes cp
               where cp.cargo_id = u.cargo_id),
             '{}'
           ) as permissoes
      from users u
      left join cargos c on c.id = u.cargo_id
     order by u.email
  `);

  const divergentes: string[] = [];
  let semCargo = 0;

  for (const l of linhas) {
    if (l.cargo === null) {
      semCargo += 1;
      divergentes.push(`  ${l.email}  SEM CARGO  (papel ${l.papel})`);
      continue;
    }
    const antes = capacidadesDeHoje(l.papel);
    const depois = [...(l.permissoes ?? [])].sort();

    const perdidas = antes.filter((p) => !depois.includes(p));
    const ganhas = depois.filter((p) => !antes.includes(p));
    if (perdidas.length === 0 && ganhas.length === 0) continue;

    divergentes.push(
      `  ${l.email}  (${l.papel} → ${l.cargo})` +
        (perdidas.length ? `\n      PERDEU: ${perdidas.join(", ")}` : "") +
        (ganhas.length ? `\n      GANHOU: ${ganhas.join(", ")}` : ""),
    );
  }

  const iguais = linhas.length - divergentes.length;
  console.log(
    `\n${linhas.length} pessoas · ${iguais} idênticas · ${divergentes.length} divergentes\n`,
  );
  if (semCargo > 0) console.log(`${semCargo} sem cargo — a rede da migração não pegou\n`);
  if (divergentes.length > 0) console.log(divergentes.join("\n") + "\n");

  /**
   * A CONTA MESTRE, CONFERIDA PELO NOME (FR-017a).
   *
   * Um relatório de 34 linhas idênticas esconde bem uma linha específica, e esta é a que abre a
   * porta para consertar todas as outras. Se ela sair da virada sem o catálogo inteiro, quem
   * precisa arrumar o acesso dos outros é o primeiro a ficar sem.
   *
   * É CONFERÊNCIA, e não regra: este endereço não aparece em nenhum lugar do código de autorização.
   * Uma conta privilegiada por e-mail escrito em código seria um segundo caminho de decisão, e
   * sobreviveria à pessoa que saiu da empresa.
   */
  const MESTRE = "victorti@braziltransports.com.br";
  const mestre = linhas.find((l) => l.email === MESTRE);
  if (!mestre) {
    console.log(`ATENÇÃO: a conta mestre (${MESTRE}) não foi encontrada.`);
  } else {
    const n = mestre.permissoes?.length ?? 0;
    const total = capacidadesDeHoje("admin").length;
    console.log(
      `conta mestre: ${MESTRE} → cargo "${mestre.cargo}" com ${n} de ${total} capacidades` +
        (n === total ? " ✓" : "  ← FALTAM CAPACIDADES"),
    );
  }

  console.log("");
  process.exit(divergentes.length === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
