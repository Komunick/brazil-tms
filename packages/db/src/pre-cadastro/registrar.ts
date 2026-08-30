import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { camposDeclarados, fundirCampos, type CamposDoPreCadastro } from "@brazil-tms/shared";
import { db } from "../client";
import {
  driverPreregistrationSubmissions,
  driverPreregistrations,
  drivers,
} from "../../schema";

/**
 * O RECEBIMENTO de um pré-cadastro mandado pelo próprio motorista (fatia 028).
 *
 * ── A REGRA QUE DÁ FORMA A ESTE ARQUIVO ───────────────────────────────────────────────────────
 *
 * O CPF cai em três situações — não existe em lugar nenhum · já tem pré-cadastro aberto · já é
 * motorista da empresa — e **quem chamou não pode saber em qual delas caiu**. Se a resposta
 * distinguisse, o formulário viraria uma máquina de descobrir quem é motorista da Brazil
 * Transports: bastaria mandar CPFs e olhar o que volta.
 *
 * Por isso esta função **não devolve o caso**. Ela devolve `void` em caso de sucesso, e o tipo de
 * retorno é a garantia: não há como a rota vazar o que não recebeu. A alternativa — devolver o caso
 * e confiar que ninguém o exponha — dependeria da disciplina de quem editar isto daqui a um ano.
 *
 * ── O TEMPO TAMBÉM É CANAL ────────────────────────────────────────────────────────────────────
 *
 * As consultas acontecem NOS TRÊS CASOS, sempre, na mesma ordem. Não há caminho curto para o CPF
 * desconhecido. Um `if` que pulasse a busca do motorista quando já existe pré-cadastro tornaria a
 * resposta mensuravelmente mais rápida num dos casos — e um cronômetro responderia a pergunta que a
 * resposta se recusa a responder.
 */

/**
 * Os dois limites, contados no POSTGRES — a constituição proíbe Redis, e a tabela de envios já tem
 * a hora de cada um.
 *
 * São dois porque o risco é diferente. Por CPF é APERTADO: ninguém se cadastra cinco vezes por
 * engano, e reenviar por foto ruim uma ou duas vezes é o uso legítimo. Por origem é FOLGADO: num
 * estande, cinquenta motoristas dividem o mesmo wi-fi e chegam com a mesma origem — um limite
 * apertado ali puniria as quarenta e nove pessoas seguintes por o evento estar cheio, que é
 * exatamente o cenário para o qual isto foi construído.
 */
const LIMITE_POR_CPF = 5;
const LIMITE_POR_ORIGEM = 120;
const JANELA_HORAS = 1;

/** O envio foi recusado por repetição — a rota traduz em 429, sem dizer qual limite bateu. */
export class MuitosEnvios extends Error {
  constructor() {
    super("Muitos envios.");
    this.name = "MuitosEnvios";
  }
}

export interface EnvioDePreCadastro {
  /** Já normalizado e validado pelo esquema compartilhado: só dígitos. */
  cpf: string;
  /** O que chegou, exatamente como chegou — guardado cru para responder "o que ele mandou?". */
  dados: Record<string, unknown>;
  /** Hash da origem, nunca o IP. Nulo quando não deu para determinar. */
  origemHash: string | null;
  documentoCnhId: string;
  documentoComprovanteId: string;
}

/**
 * Grava o envio, criando o pré-cadastro se ainda não houver um aberto para o CPF.
 *
 * Tudo numa transação: um envio cujo pré-cadastro não nasceu, ou um pré-cadastro sem o envio que o
 * originou, seriam os dois igualmente inúteis para quem for conferir.
 *
 * `drivers` NÃO é tocado em nenhum dos três casos. Ele só muda depois da conferência, por decisão
 * explícita de uma pessoa.
 */
export async function registrarPreCadastro(envio: EnvioDePreCadastro): Promise<void> {
  await db.transaction(async (tx) => {
    const desde = new Date(Date.now() - JANELA_HORAS * 3_600_000);

    // ── Os dois limites, antes de qualquer escrita ────────────────────────────────────────────
    const [porCpf] = await tx
      .select({ n: count() })
      .from(driverPreregistrationSubmissions)
      .innerJoin(
        driverPreregistrations,
        eq(driverPreregistrations.id, driverPreregistrationSubmissions.preregistrationId),
      )
      .where(
        and(
          eq(driverPreregistrations.cpf, envio.cpf),
          gt(driverPreregistrationSubmissions.recebidoEm, desde),
        ),
      );
    if ((porCpf?.n ?? 0) >= LIMITE_POR_CPF) throw new MuitosEnvios();

    if (envio.origemHash) {
      const [porOrigem] = await tx
        .select({ n: count() })
        .from(driverPreregistrationSubmissions)
        .where(
          and(
            eq(driverPreregistrationSubmissions.origemHash, envio.origemHash),
            gt(driverPreregistrationSubmissions.recebidoEm, desde),
          ),
        );
      if ((porOrigem?.n ?? 0) >= LIMITE_POR_ORIGEM) throw new MuitosEnvios();
    }

    /*
     * ── AS DUAS CONSULTAS DO CPF, sempre as duas ──────────────────────────────────────────────
     *
     * Rodam nos três casos, na mesma ordem, mesmo quando a primeira já bastaria para decidir. Ver o
     * bloco sobre o tempo como canal, no topo: pular a segunda quando a primeira acha algo faria o
     * caso "já está na fila" responder mais rápido que os outros dois.
     */
    const [aberto] = await tx
      .select({ id: driverPreregistrations.id })
      .from(driverPreregistrations)
      .where(
        and(eq(driverPreregistrations.cpf, envio.cpf), isNull(driverPreregistrations.arquivadoEm)),
      )
      .limit(1);

    const [motorista] = await tx
      .select({ id: drivers.id })
      .from(drivers)
      .where(and(eq(drivers.cpf, envio.cpf), isNull(drivers.archivedAt)))
      .limit(1);

    let preregistrationId = aberto?.id;
    if (!preregistrationId) {
      /*
       * Nasce a linha. `atualizacao` quando o CPF já é de um motorista cadastrado — e aí ela carrega
       * o id dele, para a conferência saber que está diante de uma atualização e não de gente nova.
       */
      const [criado] = await tx
        .insert(driverPreregistrations)
        .values({
          cpf: envio.cpf,
          tipo: motorista ? "atualizacao" : "novo",
          driverId: motorista?.id ?? null,
          // A declaração do toxicológico vem em `dados`; a pendência nasce aberta porque resolvê-la
          // é uma ação MANUAL na tela da gerenciadora — não existe endpoint para ela.
          pendenciaToxicologico: true,
        })
        .returning({ id: driverPreregistrations.id });
      preregistrationId = criado?.id;
      if (!preregistrationId) throw new Error("Pré-cadastro não retornou linha.");
    }

    await tx.insert(driverPreregistrationSubmissions).values({
      preregistrationId,
      origemHash: envio.origemHash,
      dados: envio.dados,
      documentoCnhId: envio.documentoCnhId,
      documentoComprovanteId: envio.documentoComprovanteId,
    });

    /**
     * O QUE O MOTORISTA DECLAROU VAI PARA `campos` AGORA (2026-08-30) — não depois, na leitura.
     *
     * Antes, `campos` só era escrito pelo job da CNH. Consequência medida no primeiro cadastro real:
     * 16 valores no envio, `campos` com uma chave só, e essa era o estado da leitura. A conferência
     * abria vazia com o endereço da pessoa ali do lado, e o envio seria recusado por `sem_endereco`,
     * `sem_cep`, `sem_bairro`, `sem_numero`, `sem_mopp` — mesmo com a CNH lida perfeitamente.
     *
     * Aqui é o lugar certo porque não depende de nada: se o provedor de leitura estiver desligado,
     * se a foto estiver ilegível, se a chave faltar, o que a pessoa digitou continua chegando. A
     * leitura é uma MELHORIA sobre isto, não um pré-requisito.
     *
     * ── O JÁ CONFERIDO VENCE O REENVIO ────────────────────────────────────────────────────────
     *
     * `fundirCampos(existentes, novos)` põe os existentes por cima — a mesma função e a mesma regra
     * do job da CNH. Sem isso, um motorista que mandasse de novo apagaria a correção que alguém do
     * escritório já tinha feito, e apagaria em silêncio.
     */
    const [linha] = await tx
      .select({ campos: driverPreregistrations.campos })
      .from(driverPreregistrations)
      .where(eq(driverPreregistrations.id, preregistrationId))
      .limit(1);

    const existentes = (linha?.campos ?? {}) as CamposDoPreCadastro;
    await tx
      .update(driverPreregistrations)
      .set({ campos: fundirCampos(existentes, camposDeclarados(envio.dados)) })
      .where(eq(driverPreregistrations.id, preregistrationId));

    /*
     * O reenvio faz a linha voltar a ser recente para quem olha a fila por `updated_at`, sem mexer
     * no `status`: uma pessoa que já estava em conferência não volta para "recebido" porque mandou
     * uma foto melhor — isso apagaria o trabalho de quem já a estava conferindo.
     */
    if (aberto) {
      await tx
        .update(driverPreregistrations)
        .set({ updatedAt: sql`now()` })
        .where(eq(driverPreregistrations.id, preregistrationId));
    }
  });
}
