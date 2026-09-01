import { sql } from "drizzle-orm";
import { CAPACIDADE_DE_ADMINISTRAR } from "@brazil-tms/shared";

/** O tipo mínimo de transação que esta função aceita — o `tx` que o drizzle passa ao callback. */
type Transacao = { execute: <T>(query: ReturnType<typeof sql>) => Promise<T[]> };

/**
 * QUANTAS PESSOAS ATIVAS AINDA ADMINISTRAM — contado DENTRO da transação, DEPOIS da escrita.
 *
 * ── POR QUE DEPOIS, E NÃO ANTES ───────────────────────────────────────────────────────────────
 *
 * Verificar antes tem uma corrida real, e ela não é hipótese de laboratório: dois administradores,
 * em duas abas, rebaixando um ao outro ao mesmo tempo. Cada transação lê "ainda há 2", cada uma
 * escreve, e a empresa acaba com ZERO — sem ninguém capaz de desfazer, porque desfazer exige
 * exatamente a capacidade que acabou de sumir.
 *
 * Contando DEPOIS, dentro da mesma transação, o banco resolve: a segunda transação enxerga o efeito
 * da primeira e é desfeita.
 *
 * Gravar para depois desfazer soa desperdício, e é a objeção óbvia. Só que a alternativa não é mais
 * barata — é ERRADA sob concorrência, e a concorrência aqui é de duas pessoas clicando, não de mil
 * requisições por segundo.
 *
 * ── UM LUGAR SÓ, PARA QUATRO CAMINHOS ─────────────────────────────────────────────────────────
 *
 * Desativar o cargo que administra, tirar a capacidade dele, mover a última pessoa, desativá-la.
 * Quatro rotas, uma pergunta. Quatro validações divergiriam em silêncio: alguém consertaria uma e as
 * outras três continuariam abrindo o buraco.
 *
 * ── O QUE ESTA CONSULTA CONTA, E O QUE ELA IGNORA ─────────────────────────────────────────────
 *
 * Só pessoa **ativa** e cargo **ativo**. Quem está desativado não consegue entrar, então não conta
 * como rede de segurança — e um cargo desativado não concede nada a ninguém.
 */
export async function quantosAindaAdministram(tx: Transacao): Promise<number> {
  /*
    CONTA PESSOAS, NÃO VÍNCULOS — e o `distinct` passou a ser obrigatório em 2026-09-01.

    Com um cargo por pessoa, `count(*)` já contava gente. Com vários cargos, alguém que tenha DOIS
    cargos administradores apareceria duas vezes — e a trava passaria a achar que há dois admins
    onde há um. O último administrador poderia então ser removido, deixando o TMS sem ninguém capaz
    de mexer em usuário e sem ninguém capaz de consertar isso.

    É o tipo de erro que só aparece no dia em que acontece, e nesse dia não há como desfazer pela
    tela.
  */
  const linhas = await tx.execute<{ n: number }>(sql`
    select count(distinct u.id)::int as n
      from users u
      join usuario_cargos uc on uc.user_id = u.id
      join cargos c on c.id = uc.cargo_id and c.ativo
      join cargo_permissoes cp
        on cp.cargo_id = uc.cargo_id and cp.permissao = ${CAPACIDADE_DE_ADMINISTRAR}
     where u.status = 'active'
  `);
  return linhas[0]?.n ?? 0;
}

/**
 * Erro que desfaz a transação quando a mudança deixaria a empresa sem administrador.
 *
 * Lançar (em vez de devolver) é o que garante o `rollback`: a escrita já aconteceu quando a
 * contagem roda, e só uma exceção a desfaz.
 */
export class SemAdministrador extends Error {
  readonly codigo = "ULTIMO_ADMIN";
  constructor() {
    super("A mudança deixaria o sistema sem ninguém capaz de administrar usuários.");
    this.name = "SemAdministrador";
  }
}

/**
 * O gesto completo: escreve, conta, e desfaz se sobrou zero.
 *
 * Toda mutação que possa mexer em administração passa por aqui — é o ÚNICO ponto de chamada da
 * contagem, e é o que faz a regra existir uma vez só.
 */
export async function garantindoAdministrador<T>(
  tx: Transacao,
  escrever: () => Promise<T>,
): Promise<T> {
  const resultado = await escrever();
  if ((await quantosAindaAdministram(tx)) < 1) throw new SemAdministrador();
  return resultado;
}
