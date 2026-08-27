import "server-only";
import {
  type Setor,
  type Turno,
  podeEditarOSetor,
  setorValido,
  turnoValido,
} from "@brazil-tms/shared";
import { setorDoUsuario } from "@brazil-tms/db";
import { Forbidden, type AuthContext } from "@/lib/auth/require-auth";

/**
 * A GUARDA DE SETOR — quem escreve na faixa de quem (2026-08-26).
 *
 * Ela existe num arquivo só porque é a regra que TODAS as rotas de escrita precisam aplicar, e uma
 * regra de autorização repetida em cinco lugares é uma regra que um dia vai valer em quatro.
 *
 * ── ISTO NÃO SUBSTITUI `requirePermission`, SOMA A ELE ────────────────────────────────────────
 *
 * A permissão diz que a pessoa pode usar o TMS de operação; o setor diz qual faixa é dela. As duas
 * portas são diferentes e as duas ficam fechadas: um `dispatcher` sem setor passa na primeira e
 * para na segunda, que é exatamente o desenho.
 *
 * ── LER É DE TODOS ────────────────────────────────────────────────────────────────────────────
 *
 * Não há guarda de leitura de propósito. A passagem de turno existe para ser lida por quem ENTRA no
 * turno seguinte — muitas vezes de outro setor — e um diário que só o autor enxerga não passa nada
 * a ninguém.
 */
export async function exigirSetor(ctx: AuthContext, setorAlvo: Setor): Promise<void> {
  const meu = await setorDoUsuario(ctx.userId);
  if (!podeEditarOSetor({ ehAdmin: ctx.role === "admin", setorDoUsuario: meu, setorAlvo })) {
    throw new Forbidden(
      meu
        ? `Esta faixa é do setor ${setorAlvo}. A sua conta responde por ${meu}.`
        : "A sua conta não tem setor na passagem de turno. Peça a um administrador.",
    );
  }
}

/**
 * `data`, `turno` e `setor` conferidos antes de chegarem ao banco.
 *
 * A DATA vai como texto `AAAA-MM-DD` até o Postgres, e nunca vira `Date` no caminho. Converter
 * aqui a interpretaria em UTC, e `2026-08-26` viraria 25/08 às 21h em São Paulo — a mesma classe de
 * defeito que `turnoDe` existe para evitar, reintroduzida na porta de entrada.
 */
export function lerChave(url: URL): { data: string; turno: Turno; setor: Setor } | null {
  const data = url.searchParams.get("data") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const turno = turnoValido(url.searchParams.get("turno"));
  const setor = setorValido(url.searchParams.get("setor"));
  if (!turno || !setor) return null;
  return { data, turno, setor };
}
