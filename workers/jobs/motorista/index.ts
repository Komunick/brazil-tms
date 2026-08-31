import { type PgBoss } from "pg-boss";
import {
  corpoDoMotorista,
  ibgeDaCidade,
  indexarCidades,
  motivosDeNaoCadastrar,
  type CamposDoPreCadastro,
  type DocumentoParaEnvio,
  type MotoristaCadastrarPayload,
} from "@brazil-tms/shared";
import {
  arquivosDoPreCadastro,
  candidatosAoCadastro,
  gravarFalhaDoCadastro,
  marcarCadastroEnviado,
  resolvePortalActorId,
} from "@brazil-tms/db";
import { documentsBucket, downloadObject } from "@brazil-tms/db/storage";
import { JOB, work } from "../../lib/queue";
import { credenciaisDaIntegra, getCidades, IntegraRecusou, setMotorista } from "../../lib/integra/cliente";

/**
 * ENVIA O CADASTRO À GERENCIADORA — o espelho se sincronizando (fatia 028, etapa 5).
 *
 * A decisão de o que mandar e de o que impede mandar é PURA e mora em
 * `packages/shared/src/domain/motorista-corpo.ts`, sob teste. Aqui está o que precisa do mundo:
 * buscar os candidatos, resolver os dois códigos IBGE, chamar e gravar.
 *
 * ── ESTA METADE NÃO CUSTA, e por isso pode ser automática ─────────────────────────────────────
 *
 * Decisão D7: `setMotorista` é de graça; só a solicitação de pesquisa é cobrada. A cautela da 026 —
 * interruptor, teto diário, uma por vez — nasceu do dinheiro e não se aplica aqui.
 *
 * A pesquisa continua sendo um CLIQUE de uma pessoa, e não passa por este job. É o que deve custar
 * mesmo: automatizar gasto é como uma conta cresce sem ninguém decidir.
 *
 * ── MAS CRIA PESSOA REAL, e é isso que governa o desenho ──────────────────────────────────────
 *
 * Não há homologação. Cada chamada bem-sucedida cria uma pessoa no cadastro deles, e não há como
 * desfazer daqui. Duas consequências no código:
 *
 *   · `enviadoEm` é gravado na MESMA transação da resposta. Um cadastro criado lá sem a marca aqui
 *     viraria duplicata no ciclo seguinte — o erro exato que esta fatia existe para evitar.
 *   · Quem já tem `enviadoEm` nunca é candidato de novo. A consulta filtra, não a lógica.
 *
 * ── UM LOTE, UM CATÁLOGO ──────────────────────────────────────────────────────────────────────
 *
 * `getCidades` traz 5.571 municípios e é consulta gratuita. Buscar por motorista seria 50 vezes a
 * mesma resposta; buscar uma vez e indexar é o que a 027 já faz.
 */
export async function registerMotoristaCadastrar(boss: PgBoss): Promise<void> {
  await work(boss, JOB.motoristaCadastrar, async (payload: MotoristaCadastrarPayload) => {
    const cred = credenciaisDaIntegra();
    if (!cred) {
      // Sem credencial a integração está DESLIGADA, que é um estado legítimo e o padrão.
      return;
    }

    /**
     * O JOB É O PORTÃO, o gatilho não. Por isso quem chama pode chamar à vontade.
     *
     * Duas coisas enfileiram isto: o fim de uma leitura de CNH bem-sucedida e o botão de uma linha.
     * Nenhuma das duas decide se o cadastro pode ir — as duas só dizem "vale reexaminar". Toda a
     * decisão está aqui e em `motivosDeNaoCadastrar`, num lugar só.
     *
     * A alternativa — cada gatilho conferir antes de enfileirar — teria a mesma regra escrita em
     * três lugares, e três cópias divergem em silêncio.
     */
    const candidatos = await candidatosAoCadastro(payload.limite ?? 50, payload.preRegistrationId);
    if (candidatos.length === 0) return;

    const indice = indexarCidades(
      (await getCidades(cred)).map((c) => ({ codIbge: c.CodIBGE, cidade: c.Cidade, uf: c.UF })),
    );
    const actorUserId = await resolvePortalActorId();

    for (const c of candidatos) {
      const campos = c.campos as CamposDoPreCadastro;
      const v = (k: string): string | null => campos[k]?.valor ?? null;

      /**
       * Os DOIS códigos IBGE vêm de lugares diferentes, e trocá-los passaria despercebido: a natal
       * sai da CNH, a de residência do CEP. Ver `cidade-ibge.ts`.
       */
      /**
       * OS ANEXOS — obrigatórios para o nosso caso (31/08, PDF pág. 52, coluna `Obr. P&C`).
       *
       * Baixados aqui, e não na função pura: ela decide, o worker busca. É a mesma divisão do resto
       * da fatia — o que fala com o mundo não decide nada.
       *
       * Uma falha ao baixar deixa a lista VAZIA de propósito, e aí `motivosDeNaoCadastrar` bloqueia
       * com `sem_documentos`. Mandar o cadastro sem os arquivos seria pior: ele nasceria na
       * gerenciadora aparentemente pronto, e a pesquisa — que CUSTA — viria incompleta.
       */
      const documentos = await anexosDoPreCadastro(c.id);

      const dados = {
        campos,
        codIbgeNatal: ibgeDaCidade(v("cidadeNatal"), v("ufNatal"), indice),
        codIbgeResidencia: ibgeDaCidade(v("cidade"), v("uf"), indice),
        cpfDivergente: c.cpfDivergente,
        documentos,
      };

      const motivos = motivosDeNaoCadastrar(dados);
      if (motivos.length > 0) {
        // TODOS os motivos, nunca o primeiro — a tela é onde a pessoa resolve.
        await gravarFalhaDoCadastro(c.id, { motivos });
        continue;
      }

      try {
        const resposta = await setMotorista(cred, corpoDoMotorista(dados) as unknown as Record<string, unknown>);
        await marcarCadastroEnviado(c.id, actorUserId, resposta);
      } catch (erro) {
        /**
         * A RECUSA DELA é gravada com a mensagem DELA, sem tradução nossa — e sem marcar como
         * enviado. O ciclo seguinte tenta de novo, e como a chamada não custa, repetir é barato.
         *
         * Um motorista que falha não pode derrubar os outros do lote: cada um é independente, e
         * parar no primeiro erro deixaria 49 cadastros esperando por causa de um.
         */
        await gravarFalhaDoCadastro(c.id, {
          erro:
            erro instanceof IntegraRecusou
              ? `gerenciadora recusou (CodErro ${erro.codErro}): ${erro.msgErro}`
              : erro instanceof Error
                ? erro.message
                : String(erro),
        });
      }
    }
  });
}

/**
 * BAIXA OS ANEXOS e os converte para o formato do manual (31/08).
 *
 * ── A EXTENSÃO SAI DO CONTENT-TYPE, não do nome do arquivo ────────────────────────────────────
 *
 * O nome vem do celular do motorista e mente com facilidade — o primeiro cadastro real chegou com
 * um PDF do app da CNH salvo com nome de foto. O `content_type` foi medido no upload e é o que a
 * gente sabe de verdade.
 *
 * A lista de extensões é FECHADA no manual. Um tipo fora dela seria recusado do outro lado, e é
 * melhor deixar o arquivo de fora aqui — com o bloqueio explicando — do que provocar uma recusa
 * que fala de outra coisa.
 *
 * ── FALHA AO BAIXAR NÃO VIRA ENVIO SEM ANEXO ──────────────────────────────────────────────────
 *
 * Um arquivo que não desce simplesmente não entra na lista, e a lista curta faz
 * `motivosDeNaoCadastrar` bloquear. É o desfecho certo: um cadastro criado sem os documentos parece
 * pronto e não é, e quem descobre é a pesquisa, depois de cobrada.
 */
async function anexosDoPreCadastro(preregistrationId: string): Promise<DocumentoParaEnvio[]> {
  const arquivos = await arquivosDoPreCadastro(preregistrationId);
  const anexos: DocumentoParaEnvio[] = [];

  for (const a of arquivos) {
    const extensao = EXTENSAO_POR_TIPO[a.contentType];
    if (!extensao) continue;
    try {
      const binario = await downloadObject(a.chave, documentsBucket());
      anexos.push({
        Descricao: a.descricao,
        Extensao: extensao,
        Documento: binario.toString("base64"),
      });
    } catch (erro) {
      // Contado no log e fora da lista — quem bloqueia é o motivo, não uma exceção aqui.
      console.error(`[motorista.cadastrar] anexo ${a.descricao} não baixou:`, erro);
    }
  }
  return anexos;
}

/**
 * O tipo medido no upload → a extensão que o manual aceita.
 *
 * Mapa fechado, e um tipo desconhecido não entra: `EXTENSOES_ACEITAS` é a lista do manual, e
 * inventar uma sigla fora dela é apostar que o outro lado tolera.
 */
const EXTENSAO_POR_TIPO: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/jpg": "JPG",
  "image/png": "PNG",
};
