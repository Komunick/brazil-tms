import { redirect } from "next/navigation";
import { can, turnoDe } from "@brazil-tms/shared";
import { setorDoUsuario } from "@brazil-tms/db";
import { verifySession } from "@/lib/auth/session";
import { PassagemDeTurnoClient } from "@/components/passagem-de-turno/passagem-de-turno-client";

/**
 * PASSAGEM DE TURNO (2026-08-26, a pedido) — o diário que hoje vive numa planilha.
 *
 * O levantamento do que a planilha é está em `docs/PROPOSTA-PASSAGEM-DE-TURNO.md`; a forma de cada
 * setor, em `packages/shared/src/domain/passagem-de-turno.ts`.
 *
 * ── A GUARDA É DE LEITURA ─────────────────────────────────────────────────────────────────────
 *
 * `view_all_trips`, os sete papéis internos. Quem escreve é decidido pelo SETOR da conta, e essa
 * decisão é do servidor em toda rota de escrita (`exigirSetor`). O que desce daqui é conveniência
 * de tela: saber o setor antes de desenhar evita a piscada de a página aparecer editável por um
 * instante e travar depois — tempo suficiente para alguém começar a digitar e perder o que
 * escreveu.
 *
 * ── ONDE "AGORA" CAI É DECIDIDO NO SERVIDOR ───────────────────────────────────────────────────
 *
 * `turnoDe` roda aqui, e não no navegador. O relógio da máquina de quem abre a tela pode estar em
 * qualquer fuso — um notebook configurado em UTC mostraria o turno errado durante três horas por
 * dia, e o operador escreveria no bloco de outro plantão sem nenhum aviso.
 */
export default async function PassagemDeTurnoPage() {
  const session = await verifySession();
  if (!session.authenticated) redirect("/login");
  if (!can(session.user.role, "view_all_trips")) redirect("/");

  const agora = turnoDe(new Date());
  const meuSetor = await setorDoUsuario(session.user.id);

  return (
    <PassagemDeTurnoClient
      dataInicial={agora.data}
      turnoInicial={agora.turno}
      meuSetor={meuSetor}
      ehAdmin={session.user.role === "admin"}
    />
  );
}
