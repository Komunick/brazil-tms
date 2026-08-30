import { type PgBoss } from "pg-boss";
import {
  camposDaLeitura,
  conferirCpfDoDocumento,
  fundirCampos,
  quantosLidos,
  type CamposDoPreCadastro,
  type CnhLerPayload,
  type MotoristaCadastrarPayload,
} from "@brazil-tms/shared";
import { documentoParaLeitura, gravarLeituraDaCnh } from "@brazil-tms/db";
import { documentsBucket, downloadObject } from "@brazil-tms/db/storage";
import { JOB, enqueue, work } from "../../lib/queue";
import { lerCnh } from "../../lib/cnh/ler";

/**
 * LER A CNH que chegou pelo formulário público (fatia 028, etapa 3).
 *
 * O que decide alguma coisa é puro e mora em `packages/shared/src/domain/cnh-lida.ts`, sob teste:
 * o que conta como lido, como a data vira ISO, quem vence na fusão. Aqui está só o que precisa do
 * mundo — buscar o binário, chamar o provedor, gravar.
 *
 * ── ELE NUNCA DERRUBA O CADASTRO ──────────────────────────────────────────────────────────────
 *
 * A leitura é uma MELHORIA sobre um fluxo que já funciona sem ela. O motorista já se cadastrou; a
 * fila já mostra o que ele digitou. Se o provedor cair, se a chave faltar, se a foto estiver
 * ilegível, o pré-cadastro continua lá e conferível à mão.
 *
 * Por isso toda falha é GRAVADA e o job termina bem, em vez de estourar e ser repetido. Repetir
 * uma foto que está borrada gastaria dinheiro para chegar ao mesmo lugar — e a mesma foto, relida,
 * dá o mesmo resultado.
 *
 * ── E ELE GRAVA ATÉ QUANDO FALHA ──────────────────────────────────────────────────────────────
 *
 * Sem registrar a falha, um pré-cadastro sem campos lidos teria duas explicações indistinguíveis:
 * "ainda não processou" e "processou e não conseguiu". A pessoa na tela ficaria esperando por algo
 * que nunca vem.
 */
export async function registerCnhLer(boss: PgBoss): Promise<void> {
  await work(boss, JOB.cnhLer, async (payload: CnhLerPayload) => {
    const alvo = await documentoParaLeitura(payload.documentoId);
    if (!alvo) {
      // Pré-cadastro arquivado ou documento apagado entre o envio e a leitura: não é erro.
      return;
    }

    const existentes = (alvo.campos ?? {}) as CamposDoPreCadastro;

    let binario: Buffer;
    try {
      binario = await downloadObject(alvo.chave, documentsBucket());
    } catch (erro) {
      await gravarLeituraDaCnh(alvo.preregistrationId, existentes, {
        estado: "falhou",
        motivo: `não foi possível baixar a foto: ${erro instanceof Error ? erro.message : String(erro)}`,
      });
      return;
    }

    const resultado = await lerCnh(binario, alvo.tipo);

    if (resultado.estado !== "lido") {
      await gravarLeituraDaCnh(alvo.preregistrationId, existentes, {
        estado: resultado.estado,
        ...(resultado.estado === "falhou" ? { motivo: resultado.motivo } : {}),
      });
      return;
    }

    /**
     * A ORDEM AQUI É A REGRA: o que o motorista digitou vence o que a foto disse.
     *
     * `fundirCampos` põe os existentes por cima, e o mais importante é o CPF — foi ele que decidiu
     * se este é cadastro novo ou atualização. Se a leitura o trocasse, a linha passaria a ter uma
     * chave diferente daquela pela qual foi criada, e ninguém entenderia por quê.
     */
    const fundidos = fundirCampos(existentes, camposDaLeitura(resultado.campos));
    const { lidos, total } = quantosLidos(fundidos);

    /**
     * O CPF DO DOCUMENTO CONTRA O QUE A PESSOA DIGITOU — e o momento é aqui, não depois.
     *
     * `fundirCampos` acabou de fazer o CPF digitado vencer o da foto, que é a regra certa. Mas ele
     * DESCARTA o do documento no processo, e é justamente esse descarte que esconderia a
     * divergência. Comparar antes de perder é a única janela que existe.
     *
     * O caso real: o primeiro cadastro recebido trazia a CNH de outra pessoa — nome e CPF
     * diferentes. Só apareceu porque alguém abriu o arquivo. Enviado assim, gastaria uma
     * solicitação de pesquisa na gerenciadora para voltar reprovado.
     */
    const cpf = conferirCpfDoDocumento(alvo.cpf, resultado.campos);

    await gravarLeituraDaCnh(alvo.preregistrationId, fundidos, {
      estado: "lido",
      lidos,
      total,
      // Só viaja quando diverge: um campo presente e falso em todo cadastro legítimo faria a tela
      // ter de saber ignorá-lo, e cedo ou tarde alguém ignoraria o caso verdadeiro junto.
      ...(cpf.estado === "diverge" ? { cpfDivergente: cpf.cpfNoDocumento } : {}),
    });

    /**
     * E DAQUI SAI PARA A GERENCIADORA — o que fecha a corrente do dia 10/09.
     *
     * O motorista preenche no celular, a CNH é lida, e o cadastro segue. Sem este enfileiramento o
     * job de envio existe e nunca roda: alguém teria de abrir a fila e apertar cinquenta botões,
     * que é exatamente o trabalho que a fatia existe para não haver.
     *
     * ── ENFILEIRA SEMPRE QUE LEU, mesmo com o CPF divergindo ──────────────────────────────────
     *
     * Não é descuido. O portão é o job, e ele recusa a divergência como recusa qualquer campo que
     * falte. Conferir aqui ANTES de enfileirar duplicaria a regra em dois lugares, e a cópia daqui
     * envelheceria sem ninguém notar — o job continuaria certo e o gatilho, errado.
     *
     * ── E ISSO SIGNIFICA QUE NINGUÉM OLHA ANTES ───────────────────────────────────────────────
     *
     * Uma leitura COMPLETA e ERRADA — um dígito trocado num RG, plausível o bastante para passar
     * pelos motivos — cria uma pessoa errada na gerenciadora sem passar por olho humano. É o risco
     * assumido em troca de um evento sem ninguém do escritório presente, e é reversível pela tela
     * deles, não daqui.
     *
     * ── FALHAR AQUI NÃO PODE PERDER A LEITURA ─────────────────────────────────────────────────
     *
     * A gravação já aconteceu. Se o pg-boss estiver fora do ar, estourar agora faria o job repetir
     * e RELER a foto — gastando de novo para chegar ao mesmo texto. O envio se recupera sozinho: o
     * botão da fila enfileira o mesmo job.
     */
    try {
      await enqueue(boss, JOB.motoristaCadastrar, {
        preRegistrationId: alvo.preregistrationId,
      } satisfies MotoristaCadastrarPayload);
    } catch (erro) {
      console.error("[cnh.ler] não foi possível enfileirar o envio do cadastro", erro);
    }
  });
}
