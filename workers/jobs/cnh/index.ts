import { type PgBoss } from "pg-boss";
import {
  camposDaLeitura,
  fundirCampos,
  quantosLidos,
  type CamposDoPreCadastro,
  type CnhLerPayload,
} from "@brazil-tms/shared";
import { documentoParaLeitura, gravarLeituraDaCnh } from "@brazil-tms/db";
import { documentsBucket, downloadObject } from "@brazil-tms/db/storage";
import { JOB, work } from "../../lib/queue";
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

    await gravarLeituraDaCnh(alvo.preregistrationId, fundidos, { estado: "lido", lidos, total });
  });
}
