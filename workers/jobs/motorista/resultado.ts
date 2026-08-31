import { type PgBoss } from "pg-boss";
import { corpoDoResultado, pesquisaAcabou, type VinculoDaPesquisa } from "@brazil-tms/shared";
import { gravarResultadoDaPesquisa, pesquisasEmAndamento, resolvePortalActorId } from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";
import { credenciaisDaIntegra, getResultadoPesquisaConsulta } from "../../lib/integra/cliente";

/**
 * BUSCA O RESULTADO DA PESQUISA — e fecha a ida e volta à tela da gerenciadora (etapa 7).
 *
 * Sem isto, a fatia parava a um passo do fim: o TMS criava a pessoa, pedia a pesquisa, cobrava — e
 * para saber se aprovou alguém tinha de abrir `cadastro.rastergr.com.br`. A ida à tela deles era
 * justamente o que a fatia veio eliminar, e ela sobrevivia no fim em vez de no começo.
 *
 * ── ESTE É DE GRAÇA, E É POR ISSO QUE PODE SER AGENDADO ───────────────────────────────────────
 *
 * `getResultadoPesquisaConsulta` é leitura, como `getCidades` e `getTabela`. O contraste com o
 * `motorista.pesquisar` ao lado é o ponto: aquele só sai de um clique porque cobra; este varre
 * sozinho porque não.
 *
 * ── PERGUNTA POR CPF E VÍNCULO ────────────────────────────────────────────────────────────────
 *
 * Não pelo `Codigo` que a solicitação devolveu (manual, pág. 150). É por isso que o vínculo
 * escolhido no pedido é guardado: sem ele, não há como perguntar o resultado do que se pagou.
 *
 * Uma pesquisa sem vínculo guardado é pulada em silêncio — ela é de antes desta etapa existir, e
 * inventar um vínculo para conseguir perguntar daria a resposta de outra classificação.
 *
 * ── PARA DE PERGUNTAR QUANDO ACABOU, E SÓ ENTÃO ───────────────────────────────────────────────
 *
 * `AD`, `NA` e `EX` são desfechos; o resto ainda anda. Situação DESCONHECIDA continua sendo
 * perguntada: se a gerenciadora inventar um código novo, o pior que acontece é uma pergunta a mais
 * — nunca uma pesquisa dada como resolvida sem estar.
 */
export async function registerMotoristaResultado(boss: PgBoss): Promise<void> {
  await work(boss, JOB.motoristaResultado, async () => {
    const cred = credenciaisDaIntegra();
    if (!cred) return;

    const pendentes = await pesquisasEmAndamento(50);
    if (pendentes.length === 0) return;

    const actorUserId = await resolvePortalActorId();

    for (const p of pendentes) {
      // Sem vínculo guardado não há pergunta possível — ver o cabeçalho.
      if (!p.vinculo) continue;

      try {
        const resposta = await getResultadoPesquisaConsulta(
          cred,
          corpoDoResultado(p.cpf, p.vinculo as VinculoDaPesquisa),
        );

        const situacao = typeof resposta.Situacao === "string" ? resposta.Situacao : null;
        /**
         * Grava SEMPRE, mesmo quando a situação não mudou.
         *
         * Poderia comparar antes e poupar uma escrita, e não vale: a resposta traz também as
         * `Justificativas` — o que impediu a aprovação, por extenso — e elas mudam sem a situação
         * mudar. É essa lista que diz o que fazer para destravar, e é ela que hoje só existe
         * abrindo a tela deles.
         */
        await gravarResultadoDaPesquisa(p.id, actorUserId, {
          vinculo: p.vinculo,
          situacao,
          acabou: pesquisaAcabou(situacao),
          resposta,
        });
      } catch (erro) {
        /**
         * Uma falha aqui NÃO derruba as outras e NÃO é gravada como desfecho.
         *
         * A leitura é de graça e o job volta a rodar: uma indisponibilidade da gerenciadora não pode
         * virar "pesquisa sem resultado" no registro de ninguém. O log conta o que houve.
         */
        console.error(`[motorista.resultado] ${p.cpf}:`, erro);
      }
    }
  });

  /**
   * DE MEIA EM MEIA HORA, e sobrescrevível.
   *
   * A auditoria da gerenciadora leva horas ou dias — a pesquisa não muda de minuto em minuto, e
   * perguntar mais rápido só encheria o log. Meia hora é curto o bastante para alguém que está
   * esperando não precisar recarregar a página o dia todo.
   *
   * E é de GRAÇA: por isso pode ser agendado. O irmão que pede a pesquisa nunca terá um cron.
   */
  await boss.schedule(JOB.motoristaResultado, process.env.PESQUISA_RESULTADO_CRON ?? "23,53 * * * *", {}, {});
}
