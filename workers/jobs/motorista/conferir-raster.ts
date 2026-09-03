import { type PgBoss } from "pg-boss";
import {
  COD_FILIAL,
  VINCULOS_DA_PESQUISA,
  type MotoristaConferirRasterPayload,
  type VinculoDaPesquisa,
} from "@brazil-tms/shared";
import { gravarConferenciaNaRaster, preCadastroParaConferencia } from "@brazil-tms/db";
import { credenciaisDaIntegra, getMotorista, pesquisaExistente } from "../../lib/integra/cliente";
import { JOB, work } from "../../lib/queue";

/**
 * O QUE A GERENCIADORA JÁ SABE SOBRE ESTE CPF — antes de cadastrar ou de gastar (2026-09-03).
 *
 * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────────────────────
 *
 * A gerenciadora **não bloqueia pesquisa repetida** (usuário, 03/09): mandar duas vezes cria DUAS
 * pesquisas e cobra as duas, sem erro e sem aviso. O único lugar onde isso pode ser impedido é
 * aqui, e para impedir é preciso primeiro PERGUNTAR.
 *
 * ── AS QUATRO LEITURAS, E POR QUE SÃO QUATRO ──────────────────────────────────────────────────
 *
 *   1. `getMotorista` — ele já está cadastrado lá? (evita um `setMotorista` que criaria duplicata)
 *   2-4. `pesquisaExistente` nos TRÊS vínculos — F, A e T.
 *
 * Os três não são zelo: a consulta só encontra a pesquisa se o vínculo bater. Medido em produção, a
 * pesquisa do CPF 08389766469 existe sob **A**, e perguntando como F ou T a resposta é "não
 * existe". Perguntar só pelo vínculo escolhido na hora diria "pode mandar" exatamente no caso que
 * se quer evitar.
 *
 * ── É JOB, E NÃO ROTA, PELO MOTIVO DE SEMPRE ──────────────────────────────────────────────────
 *
 * A credencial da gerenciadora vive só no worker (princípio da constituição). Uma rota que
 * consultasse a Integra exigiria a senha de produção dentro do Next.
 *
 * ── O CUSTO É TEMPO, NÃO DINHEIRO ─────────────────────────────────────────────────────────────
 *
 * Leitura é de graça. Mas a Integra recusa chamadas próximas demais (`CodErro 102`, 30 segundos), e
 * o cliente espera sozinho quando isso acontece — então a conferência leva cerca de um minuto e
 * meio. É por isso que ela nasce de um BOTÃO e não da abertura da tela: pendurar a tela por um
 * minuto e meio toda vez que alguém abre um pré-cadastro seria pior que o problema.
 */
export async function registerMotoristaConferirRaster(boss: PgBoss): Promise<void> {
  await work(boss, JOB.motoristaConferirRaster, async (payload: MotoristaConferirRasterPayload) => {
    const cred = credenciaisDaIntegra();
    if (!cred) {
      // Sem credencial a integração está DESLIGADA — estado legítimo e o padrão fora da produção.
      return;
    }

    const item = await preCadastroParaConferencia(payload.preRegistrationId);
    if (!item) return;

    const cpf = String(item.cpf ?? "").replace(/\D/g, "");
    if (cpf.length !== 11) {
      await gravarConferenciaNaRaster(payload.preRegistrationId, {
        cadastrado: false,
        codigoNaGerenciadora: null,
        pesquisas: [],
        erro: "CPF incompleto — não dá para perguntar à gerenciadora.",
      });
      return;
    }

    try {
      const motorista = await getMotorista(cred, cpf);

      /*
        EM SÉRIE, e não em paralelo.

        Paralelo seria mais rápido no papel e mais lento na prática: as quatro chamadas cairiam
        juntas no limite de frequência, cada uma esperaria os 30 segundos, e a espera do cliente
        aconteceria quatro vezes em vez de escalonada. Em série cada uma chega depois da anterior.
      */
      const pesquisas: {
        vinculo: string;
        codigo: number;
        situacao: string;
        dataExpiracao: string | null;
      }[] = [];
      for (const vinculo of VINCULOS_DA_PESQUISA as readonly VinculoDaPesquisa[]) {
        const p = await pesquisaExistente(cred, { codFilial: COD_FILIAL, cpf, vinculo });
        if (p) {
          pesquisas.push({
            vinculo,
            codigo: p.codigo,
            situacao: p.situacao,
            dataExpiracao: p.dataExpiracao,
          });
        }
      }

      await gravarConferenciaNaRaster(payload.preRegistrationId, {
        cadastrado: motorista !== null,
        codigoNaGerenciadora: motorista ? Number(motorista.Codigo ?? 0) || null : null,
        pesquisas,
      });
    } catch (erro) {
      /*
        A FALHA É GRAVADA, e não engolida.

        Uma conferência que falha em silêncio deixa a tela dizendo "nunca conferido", e quem olha
        conclui que o botão não funciona. Escrita, ela vira uma frase na tela e um motivo para
        tentar de novo — e tentar de novo é barato, porque leitura não custa.
      */
      await gravarConferenciaNaRaster(payload.preRegistrationId, {
        cadastrado: false,
        codigoNaGerenciadora: null,
        pesquisas: [],
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
  });
}
