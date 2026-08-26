import { NextResponse } from "next/server";
import { filaDaGR } from "@brazil-tms/db";
import {
  divergenciasDaPreSm,
  montarCorpoDoSetPreSM,
  motivosDeNaoEnviar,
} from "@brazil-tms/shared";
import type { OwnershipType } from "@brazil-tms/shared";
import { requireAuth, requirePermission } from "@/lib/auth/require-auth";
import { handleRouteError } from "@/lib/api/respond";
import { configuracaoDaIntegra } from "@/lib/gr/configuracao";

export const dynamic = "force-dynamic";

/**
 * GET /api/gr — a fila da aba GR (2026-08-26, fatia 027).
 *
 * Devolve as viagens atribuídas com **o que será enviado** e **o que falta** em cada uma. O cálculo
 * do que falta acontece aqui, no servidor, com a mesma função pura que o worker usa para montar o
 * corpo — e é por isso que a tela nunca discorda do envio.
 *
 * Duas regras diferentes para a mesma pergunta seriam o defeito clássico: a linha ficaria verde e o
 * envio recusaria, ou o contrário.
 *
 * ── QUEM PODE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `assign_resources`, a mesma chave de quem atribui. É a mesma pessoa: a Pré-SM nasce da atribuição
 * que ela fez.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await requireAuth();
    requirePermission(ctx, "assign_resources");

    const cfg = configuracaoDaIntegra();
    const linhas = await filaDaGR();

    const items = linhas.map((l) => {
      const dados = {
        codFilial: cfg.codFilial,
        codPerfilSeguranca: cfg.codPerfilSeguranca,
        codRota: l.codRota,
        codIbgeOrigem: l.codIbgeOrigem,
        codIbgeDestino: l.codIbgeDestino,
        cpfMotorista: l.cpfMotorista,
        vinculoMotorista: l.vinculoMotorista as OwnershipType | null,
        cpfSegundoMotorista: l.cpfSegundoMotorista,
        vinculoSegundoMotorista: l.vinculoSegundoMotorista as OwnershipType | null,
        placas: l.placas.map((p) => ({
          placa: p.placa,
          vinculo: p.vinculo as OwnershipType | null,
        })),
        chegadaNaColeta: l.chegadaNaColeta,
        saidaDaColeta: l.saidaDaColeta,
        chegadaNaEntrega: l.chegadaNaEntrega,
        saidaDaEntrega: l.saidaDaEntrega,
      };

      return {
        ...l,
        motivos: motivosDeNaoEnviar(dados),
        /**
         * `pronta` NÃO é "não há motivos": é o corpo tendo sido montado de verdade.
         *
         * A diferença aparece quando a configuração falta — aí não há motivo nenhum (não é trabalho
         * de cadastro de ninguém) e mesmo assim não dá para enviar. Perguntar ao montador é a única
         * forma de a tela concordar com o worker em todos os casos.
         */
        pronta: montarCorpoDoSetPreSM(dados) != null,
        /**
         * A DIVERGÊNCIA (FR-016): a atribuição mudou depois da Pré-SM criada.
         *
         * Calculada na LEITURA, nunca guardada — ela muda a cada reatribuição, e uma coluna ficaria
         * velha no instante seguinte.
         *
         * Só interessa quando a Pré-SM EXISTE de verdade lá: uma que nunca saiu não descreve
         * ninguém, e dizer que ela diverge seria um aviso sobre nada.
         */
        divergencias:
          l.preSmStatus === "criada"
            ? divergenciasDaPreSm(
                (l.payloadEnviado?.PreSM as { Engate?: Record<string, unknown> })?.Engate ?? null,
                {
                  cpfMotorista: l.cpfMotorista,
                  placas: l.placas.map((p) => p.placa),
                },
              )
            : [],
      };
    });

    return NextResponse.json({ items, configurada: cfg.codFilial != null });
  } catch (error) {
    return handleRouteError(error);
  }
}
