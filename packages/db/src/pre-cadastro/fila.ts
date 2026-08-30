import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../client";
import {
  driverPreregistrationSubmissions,
  driverPreregistrations,
  drivers,
  resourceDocuments,
} from "../../schema";
import { writeAudit } from "../audit/write-audit";

/**
 * A FILA DE PRÉ-CADASTROS — a tela interna que torna o evento possível (fatia 028, etapa 2).
 *
 * Sem ela, os envios do dia 10/09 chegam ao banco e ninguém tem como olhá-los: a etapa 1 entrega o
 * dado, esta entrega a pessoa que trabalha com ele.
 *
 * ── DE ONDE VEM O NOME QUE A FILA MOSTRA ──────────────────────────────────────────────────────
 *
 * Do ÚLTIMO ENVIO, e não de `campos`. `campos` é o consolidado COM A ORIGEM de cada valor, e ele só
 * é preenchido na conferência (P2, com a leitura da CNH). Antes disso ele está vazio — mostrar a
 * fila a partir dele daria uma tela de linhas sem nome no dia do evento.
 *
 * O envio mais recente é a melhor verdade disponível: se a pessoa mandou de novo por ter errado o
 * telefone, é o segundo que vale.
 */

export interface ItemDaFila {
  id: string;
  cpf: string;
  tipo: "novo" | "atualizacao";
  status: string;
  /** Preenchido quando `tipo = atualizacao`: quem já está cadastrado com este CPF. */
  motoristaId: string | null;
  motoristaNome: string | null;
  /** Do último envio — ver o bloco acima. Nulo se o envio não trouxe (não deveria acontecer). */
  nome: string | null;
  celular: string | null;
  /** Quantos envios esta pessoa fez. Mais de um quase sempre quer dizer foto ruim na primeira. */
  envios: number;
  pendenciaToxicologico: boolean;
  /**
   * O ESTADO DA LEITURA DA CNH, para a tela poder dizer a verdade.
   *
   * `null` é "ainda não processou"; `falhou` e `nao_configurado` são desfechos. Sem essa distinção,
   * um pré-cadastro sem campos lidos teria duas explicações indistinguíveis e a pessoa ficaria
   * esperando por algo que nunca vem.
   */
  leituraCnh: {
    estado: string;
    motivo?: string;
    lidos?: number;
    total?: number;
    /** O CPF impresso no documento, quando ele NÃO bate com o que a pessoa digitou. */
    cpfDivergente?: string;
  } | null;
  documentoCnhId: string | null;
  documentoComprovanteId: string | null;
  recebidoEm: string;
  atualizadoEm: string;
}

/**
 * A fila por ORDEM DE CHEGADA, sem os arquivados.
 *
 * Ordem de chegada e não prioridade: num evento, quem mandou primeiro esperou mais, e qualquer
 * outra ordenação precisaria de um critério que ninguém pediu.
 */
export async function listarFilaDePreCadastros(): Promise<ItemDaFila[]> {
  /**
   * O último envio de cada pré-cadastro, por subconsulta lateral.
   *
   * A alternativa — trazer todos os envios e escolher em JavaScript — funcionaria com cinquenta
   * linhas e passaria a arrastar o banco inteiro quando a fila crescer. O índice
   * `(preregistration_id, recebido_em DESC)` existe exatamente para esta consulta.
   */
  const ultimo = db
    .select({
      preregistrationId: driverPreregistrationSubmissions.preregistrationId,
      dados: driverPreregistrationSubmissions.dados,
      documentoCnhId: driverPreregistrationSubmissions.documentoCnhId,
      documentoComprovanteId: driverPreregistrationSubmissions.documentoComprovanteId,
      recebidoEm: driverPreregistrationSubmissions.recebidoEm,
      posicao:
        sql<number>`row_number() over (partition by ${driverPreregistrationSubmissions.preregistrationId} order by ${driverPreregistrationSubmissions.recebidoEm} desc)`.as(
          "posicao",
        ),
    })
    .from(driverPreregistrationSubmissions)
    .as("ultimo");

  const linhas = await db
    .select({
      id: driverPreregistrations.id,
      cpf: driverPreregistrations.cpf,
      tipo: driverPreregistrations.tipo,
      status: driverPreregistrations.status,
      motoristaId: driverPreregistrations.driverId,
      motoristaNome: drivers.name,
      pendenciaToxicologico: driverPreregistrations.pendenciaToxicologico,
      camposConsolidados: driverPreregistrations.campos,
      criadoEm: driverPreregistrations.createdAt,
      atualizadoEm: driverPreregistrations.updatedAt,
      dados: ultimo.dados,
      documentoCnhId: ultimo.documentoCnhId,
      documentoComprovanteId: ultimo.documentoComprovanteId,
      envios: sql<number>`(
        select count(*) from ${driverPreregistrationSubmissions}
         where ${driverPreregistrationSubmissions.preregistrationId} = ${driverPreregistrations.id}
      )`,
    })
    .from(driverPreregistrations)
    .leftJoin(ultimo, and(eq(ultimo.preregistrationId, driverPreregistrations.id), eq(ultimo.posicao, 1)))
    .leftJoin(drivers, eq(drivers.id, driverPreregistrations.driverId))
    .where(isNull(driverPreregistrations.arquivadoEm))
    .orderBy(desc(driverPreregistrations.createdAt));

  return linhas.map((l) => {
    const dados = (l.dados ?? {}) as Record<string, unknown>;
    return {
      id: l.id,
      cpf: l.cpf,
      tipo: l.tipo,
      status: l.status,
      motoristaId: l.motoristaId,
      motoristaNome: l.motoristaNome ?? null,
      nome: typeof dados.nome === "string" ? dados.nome : null,
      celular: typeof dados.celular === "string" ? dados.celular : null,
      envios: Number(l.envios ?? 0),
      pendenciaToxicologico: l.pendenciaToxicologico,
      leituraCnh:
        (((l.camposConsolidados ?? {}) as Record<string, unknown>).leituraCnh as ItemDaFila["leituraCnh"]) ??
        null,
      documentoCnhId: l.documentoCnhId ?? null,
      documentoComprovanteId: l.documentoComprovanteId ?? null,
      recebidoEm: l.criadoEm.toISOString(),
      atualizadoEm: l.atualizadoEm.toISOString(),
    };
  });
}

/**
 * ARQUIVAR — o descarte que MARCA e não apaga (princípio III).
 *
 * A linha some da fila e continua no banco, com quem arquivou, quando e por quê. Duas razões, e a
 * segunda é a que importa: um descarte por engano se desfaz, e o índice único de CPF é parcial
 * justamente para que a pessoa possa se recadastrar depois.
 *
 * O MOTIVO é obrigatório. "Arquivado" sem motivo, meses depois, não distingue duplicata de trote de
 * cadastro legítimo que alguém fechou sem querer — e quem for revisar não terá a quem perguntar.
 */
export async function arquivarPreCadastro(
  id: string,
  actorUserId: string,
  motivo: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ cpf: driverPreregistrations.cpf, status: driverPreregistrations.status })
      .from(driverPreregistrations)
      .where(and(eq(driverPreregistrations.id, id), isNull(driverPreregistrations.arquivadoEm)))
      .limit(1);
    // Já arquivado (ou inexistente) não é erro: dois cliques na mesma linha não podem virar duas
    // histórias diferentes no histórico.
    if (!antes) return false;

    await tx
      .update(driverPreregistrations)
      .set({
        status: "arquivado",
        arquivadoEm: new Date(),
        arquivadoPor: actorUserId,
        arquivadoMotivo: motivo,
        updatedAt: new Date(),
      })
      .where(eq(driverPreregistrations.id, id));

    await writeAudit(tx, {
      entityType: "driver_preregistration",
      entityId: id,
      action: "preregistration.archive",
      previousValue: { status: antes.status },
      newValue: { status: "arquivado" },
      actorUserId,
      reason: motivo,
    });
    return true;
  });
}

/**
 * A CHAVE DE STORAGE de uma foto do pré-cadastro — e a autorização que a acompanha.
 *
 * A checagem NÃO é por dono: o `entity_id` desses documentos é um id sorteado no recebimento, antes
 * de o pré-cadastro existir (a foto sobe primeiro, para não gerar linha apontando para binário que
 * não subiu). Amarrar a autorização a ele obrigaria a carregar um identificador a mais pela tela
 * inteira sem nada em troca.
 *
 * A pergunta certa é outra e é mais forte: **este documento é referenciado por um envio de
 * verdade?** Um id de documento que não aparece em nenhuma submissão não abre — e como quem chega
 * até aqui já tem `manage_fleet_data` e enxerga a fila inteira, não há nada a mais a restringir.
 *
 * Devolve `null` quando não há: quem chama vira 404, e nunca um link assinado.
 */
export async function chaveDoDocumentoDePreCadastro(documentId: string): Promise<string | null> {
  const [linha] = await db
    .select({ chave: resourceDocuments.fileStorageKey })
    .from(resourceDocuments)
    .innerJoin(
      driverPreregistrationSubmissions,
      or(
        eq(driverPreregistrationSubmissions.documentoCnhId, resourceDocuments.id),
        eq(driverPreregistrationSubmissions.documentoComprovanteId, resourceDocuments.id),
      ),
    )
    .where(
      and(
        eq(resourceDocuments.id, documentId),
        // Cinto e suspensório: só documento cujo dono declarado é pré-cadastro. Impede que um id de
        // documento de FROTA, colado nesta rota, saia por uma porta que não é a dele.
        eq(resourceDocuments.entityType, "preregistration"),
      ),
    )
    .limit(1);
  return linha?.chave ?? null;
}

/**
 * O DOCUMENTO A LER e o que já se sabe sobre o pré-cadastro (fatia 028, etapa 3).
 *
 * Devolve a chave de storage da foto e os campos já consolidados, para o worker ler o binário e
 * fundir sem precisar de duas viagens ao banco.
 */
export async function documentoParaLeitura(documentoId: string): Promise<{
  preregistrationId: string;
  /**
   * O CPF que a PESSOA digitou. Vai junto porque a leitura o compara com o CPF impresso no
   * documento — foi assim que se descobriu, no primeiro cadastro real, uma CNH de outra pessoa.
   */
  cpf: string;
  chave: string;
  tipo: string;
  campos: Record<string, unknown>;
} | null> {
  const [linha] = await db
    .select({
      preregistrationId: driverPreregistrations.id,
      cpf: driverPreregistrations.cpf,
      chave: resourceDocuments.fileStorageKey,
      tipo: resourceDocuments.contentType,
      campos: driverPreregistrations.campos,
    })
    .from(resourceDocuments)
    // O caminho do documento até o pré-cadastro passa pelo ENVIO — é ele que liga os dois. O job
    // recebe só o documento justamente para a rota pública não precisar conhecer o pré-cadastro.
    .innerJoin(
      driverPreregistrationSubmissions,
      eq(driverPreregistrationSubmissions.documentoCnhId, resourceDocuments.id),
    )
    .innerJoin(
      driverPreregistrations,
      eq(driverPreregistrations.id, driverPreregistrationSubmissions.preregistrationId),
    )
    .where(
      and(
        eq(resourceDocuments.id, documentoId),
        eq(resourceDocuments.entityType, "preregistration"),
        // Arquivado entre o envio e a leitura: não gasta chamada paga com o que foi descartado.
        isNull(driverPreregistrations.arquivadoEm),
      ),
    )
    .limit(1);
  if (!linha) return null;
  return {
    preregistrationId: linha.preregistrationId,
    cpf: linha.cpf,
    chave: linha.chave,
    tipo: linha.tipo,
    campos: (linha.campos ?? {}) as Record<string, unknown>,
  };
}

/**
 * GRAVA o que a leitura produziu — inclusive quando ela falhou.
 *
 * A falha é gravada de propósito, em `leituraCnh`. Sem isso, um pré-cadastro sem campos lidos teria
 * duas explicações indistinguíveis — "ainda não processou" e "processou e não conseguiu" — e a
 * pessoa na tela ficaria esperando por algo que nunca vai chegar.
 *
 * `campos` é substituído inteiro porque quem chama já fundiu com o que existia (`fundirCampos`):
 * a decisão de quem vence mora naquela função pura, sob teste, e não espalhada em SQL.
 */
export async function gravarLeituraDaCnh(
  preregistrationId: string,
  campos: Record<string, unknown>,
  leitura: { estado: string; motivo?: string; lidos?: number; total?: number; cpfDivergente?: string },
): Promise<void> {
  await db
    .update(driverPreregistrations)
    .set({
      campos: { ...campos, leituraCnh: { ...leitura, em: new Date().toISOString() } },
      updatedAt: new Date(),
    })
    .where(eq(driverPreregistrations.id, preregistrationId));
}

/**
 * O QUE O ENVIO À GERENCIADORA PRECISA SABER (fatia 028, etapa 5).
 *
 * Só os pré-cadastros PRONTOS para tentar: não arquivados e ainda não enviados. Quem decide se cada
 * um pode de fato ir é `motivosDeNaoCadastrar`, no worker — aqui só se traz o candidato.
 *
 * `campos` vem inteiro porque é dele que sai o corpo, e a divergência de CPF vem junto: ela mora
 * dentro de `campos.leituraCnh` e é um dos motivos de bloqueio.
 */
export interface CandidatoAoCadastro {
  id: string;
  cpf: string;
  campos: Record<string, unknown>;
  cpfDivergente: boolean;
}

export async function candidatosAoCadastro(limite = 50): Promise<CandidatoAoCadastro[]> {
  const linhas = await db
    .select({
      id: driverPreregistrations.id,
      cpf: driverPreregistrations.cpf,
      campos: driverPreregistrations.campos,
    })
    .from(driverPreregistrations)
    .where(
      and(
        isNull(driverPreregistrations.arquivadoEm),
        // Já enviado não se manda de novo: o `setMotorista` cria pessoa, e repetir criaria duplicata
        // no cadastro deles — o erro exato que esta fatia existe para evitar.
        isNull(driverPreregistrations.enviadoEm),
      ),
    )
    .orderBy(driverPreregistrations.createdAt)
    .limit(limite);

  return linhas.map((l) => {
    const campos = (l.campos ?? {}) as Record<string, unknown>;
    const leitura = campos.leituraCnh as { cpfDivergente?: string } | undefined;
    return {
      id: l.id,
      cpf: l.cpf,
      campos,
      cpfDivergente: Boolean(leitura?.cpfDivergente),
    };
  });
}

/**
 * MARCA O CADASTRO COMO ENVIADO, e guarda o que a gerenciadora respondeu.
 *
 * A resposta vai CRUA em `campos.cadastroGerenciadora`. É a mesma decisão de
 * `portal_commands.response` e do `dados` do envio: guardar o corpo sem tradução é o que permitiu,
 * duas vezes neste projeto, achar um defeito que a versão interpretada escondia.
 *
 * `enviadoEm` é o que impede o reenvio — e ele é gravado na MESMA transação do resto. Um cadastro
 * criado na gerenciadora sem a marca aqui viraria duplicata no ciclo seguinte.
 */
export async function marcarCadastroEnviado(
  id: string,
  actorUserId: string,
  resposta: Record<string, unknown>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ campos: driverPreregistrations.campos })
      .from(driverPreregistrations)
      .where(eq(driverPreregistrations.id, id))
      .limit(1);

    await tx
      .update(driverPreregistrations)
      .set({
        status: "enviado",
        enviadoEm: new Date(),
        enviadoPor: actorUserId,
        campos: {
          ...((antes?.campos ?? {}) as Record<string, unknown>),
          cadastroGerenciadora: { em: new Date().toISOString(), resposta },
        },
        updatedAt: new Date(),
      })
      .where(eq(driverPreregistrations.id, id));

    await writeAudit(tx, {
      entityType: "driver_preregistration",
      entityId: id,
      action: "preregistration.sent",
      previousValue: null,
      newValue: { resposta },
      actorUserId,
    });
  });
}

/**
 * GRAVA A FALHA sem marcar como enviado — para a tela dizer por que parou.
 *
 * `enviadoEm` fica NULO de propósito: o ciclo seguinte tenta de novo. Uma falha de rede não pode
 * consumir a única chance de um cadastro, e como a chamada não custa, repetir é barato.
 */
export async function gravarFalhaDoCadastro(
  id: string,
  detalhe: { motivos?: string[]; erro?: string },
): Promise<void> {
  const [antes] = await db
    .select({ campos: driverPreregistrations.campos })
    .from(driverPreregistrations)
    .where(eq(driverPreregistrations.id, id))
    .limit(1);

  await db
    .update(driverPreregistrations)
    .set({
      campos: {
        ...((antes?.campos ?? {}) as Record<string, unknown>),
        cadastroGerenciadora: { em: new Date().toISOString(), ...detalhe },
      },
      updatedAt: new Date(),
    })
    .where(eq(driverPreregistrations.id, id));
}
