import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { CamposDoPreCadastro } from "@brazil-tms/shared";
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
  /**
   * O QUE ACONTECEU NO ENVIO À GERENCIADORA — sem isto o botão não tem resposta.
   *
   * Um botão cujo resultado não aparece em lugar nenhum é pior do que botão nenhum: quem apertou
   * não sabe se funcionou, aperta de novo, e o silêncio vira desconfiança na tela inteira.
   *
   * `enviadoEm` é o desfecho FELIZ e é definitivo. `cadastro` é a última tentativa — o que faltou,
   * ou a recusa dela — e existe tanto para quem ainda não foi quanto para quem já foi.
   */
  enviadoEm: string | null;
  cadastro: {
    em: string;
    /** Códigos de `motivosDeNaoCadastrar`; a tela os traduz. */
    motivos?: string[];
    /** A recusa DELA, com a mensagem DELA, sem tradução nossa. */
    erro?: string;
  } | null;
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
      enviadoEm: driverPreregistrations.enviadoEm,
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
      enviadoEm: l.enviadoEm?.toISOString() ?? null,
      cadastro:
        (((l.camposConsolidados ?? {}) as Record<string, unknown>)
          .cadastroGerenciadora as ItemDaFila["cadastro"]) ?? null,
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
 * UM PRÉ-CADASTRO INTEIRO, para a tela de conferência (fatia 028, etapa 4).
 *
 * A fila mostra o suficiente para escolher em qual linha trabalhar. Isto é o que a pessoa precisa
 * para de fato CONFERIR: todos os campos, cada um com a sua procedência, e as fotos ao lado.
 */
export interface PreCadastroParaConferencia {
  id: string;
  cpf: string;
  tipo: "novo" | "atualizacao";
  motoristaNome: string | null;
  nome: string | null;
  campos: CamposDoPreCadastro;
  leituraCnh: ItemDaFila["leituraCnh"];
  documentoCnhId: string | null;
  documentoComprovanteId: string | null;
  /**
   * O tipo do arquivo da CNH — `image/jpeg`, `application/pdf`.
   *
   * A tela precisa saber ANTES de renderizar: imagem entra num `<img>`, PDF num `<object>`. Adivinhar
   * pela extensão do nome falharia justamente no caso comum, que é o PDF do app da CNH chegando com
   * nome de foto do celular.
   */
  documentoCnhTipo: string | null;
  pendenciaToxicologico: boolean;
  enviadoEm: string | null;
  cadastro: ItemDaFila["cadastro"];
  /** O pedido de PESQUISA — a metade cobrada. Presente = já foi pedida, não peça de novo. */
  pesquisa: { em: string; motivos?: string[]; erro?: string; resposta?: Record<string, unknown> } | null;
  recebidoEm: string;
}

export async function preCadastroParaConferencia(
  id: string,
): Promise<PreCadastroParaConferencia | null> {
  const [linha] = await db
    .select({
      id: driverPreregistrations.id,
      cpf: driverPreregistrations.cpf,
      tipo: driverPreregistrations.tipo,
      campos: driverPreregistrations.campos,
      motoristaNome: drivers.name,
      pendenciaToxicologico: driverPreregistrations.pendenciaToxicologico,
      enviadoEm: driverPreregistrations.enviadoEm,
      arquivadoEm: driverPreregistrations.arquivadoEm,
      criadoEm: driverPreregistrations.createdAt,
    })
    .from(driverPreregistrations)
    .leftJoin(drivers, eq(drivers.id, driverPreregistrations.driverId))
    .where(eq(driverPreregistrations.id, id))
    .limit(1);

  // Arquivado não abre: a linha existe para o histórico, não para voltar a ser trabalhada.
  if (!linha || linha.arquivadoEm) return null;

  const [ultimo] = await db
    .select({
      dados: driverPreregistrationSubmissions.dados,
      documentoCnhId: driverPreregistrationSubmissions.documentoCnhId,
      documentoComprovanteId: driverPreregistrationSubmissions.documentoComprovanteId,
    })
    .from(driverPreregistrationSubmissions)
    .where(eq(driverPreregistrationSubmissions.preregistrationId, id))
    .orderBy(desc(driverPreregistrationSubmissions.recebidoEm))
    .limit(1);

  const [docCnh] = ultimo?.documentoCnhId
    ? await db
        .select({ contentType: resourceDocuments.contentType })
        .from(resourceDocuments)
        .where(eq(resourceDocuments.id, ultimo.documentoCnhId))
        .limit(1)
    : [];

  const todos = (linha.campos ?? {}) as Record<string, unknown>;
  const { leituraCnh, cadastroGerenciadora, pesquisaGerenciadora, ...campos } = todos;
  const dados = (ultimo?.dados ?? {}) as Record<string, unknown>;

  return {
    id: linha.id,
    cpf: linha.cpf,
    tipo: linha.tipo,
    motoristaNome: linha.motoristaNome ?? null,
    nome: typeof dados.nome === "string" ? dados.nome : null,
    campos: campos as CamposDoPreCadastro,
    leituraCnh: (leituraCnh as ItemDaFila["leituraCnh"]) ?? null,
    documentoCnhId: ultimo?.documentoCnhId ?? null,
    documentoComprovanteId: ultimo?.documentoComprovanteId ?? null,
    documentoCnhTipo: docCnh?.contentType ?? null,
    pendenciaToxicologico: linha.pendenciaToxicologico,
    enviadoEm: linha.enviadoEm?.toISOString() ?? null,
    cadastro: (cadastroGerenciadora as ItemDaFila["cadastro"]) ?? null,
    pesquisa: (pesquisaGerenciadora as PreCadastroParaConferencia["pesquisa"]) ?? null,
    recebidoEm: linha.criadoEm.toISOString(),
  };
}

/**
 * O FUNCIONÁRIO CORRIGIU — e o que ele tocou passa a ter origem `digitado`.
 *
 * A procedência não é enfeite. Ela é o que permite, meses depois, separar "o modelo leu errado" de
 * "o motorista mandou errado": um campo `cnh` errado é defeito de leitura, um `digitado` errado é
 * outra história inteiramente. Manter a origem antiga num valor mexido apagaria essa distinção logo
 * no caso em que ela mais importa.
 *
 * ── SÓ O QUE MUDOU ────────────────────────────────────────────────────────────────────────────
 *
 * Quem chama manda os campos que abriu; aqui só entram os que têm valor DIFERENTE do que já estava.
 * Sem essa comparação, abrir a tela e salvar sem mexer em nada marcaria os catorze campos como
 * digitados, e a origem deixaria de querer dizer alguma coisa.
 *
 * ── E NÃO MEXE EM QUEM JÁ FOI ─────────────────────────────────────────────────────────────────
 *
 * Cadastro já enviado é retrato do que foi mandado. Editá-lo faria o TMS e a gerenciadora
 * discordarem em silêncio, e o TMS pareceria a versão certa.
 */
export async function salvarCamposConferidos(
  id: string,
  alteracoes: Record<string, string | null>,
  actorUserId: string,
): Promise<{ salvo: boolean; mudou: string[] }> {
  return db.transaction(async (tx) => {
    const [linha] = await tx
      .select({ campos: driverPreregistrations.campos, enviadoEm: driverPreregistrations.enviadoEm })
      .from(driverPreregistrations)
      .where(eq(driverPreregistrations.id, id))
      .limit(1);

    if (!linha || linha.enviadoEm) return { salvo: false, mudou: [] };

    const atuais = (linha.campos ?? {}) as Record<string, unknown>;
    const antes: Record<string, string | null> = {};
    const depois: Record<string, string | null> = {};
    const novos = { ...atuais };

    for (const [chave, valor] of Object.entries(alteracoes)) {
      const atual = (atuais[chave] ?? null) as { valor?: string | null } | null;
      const anterior = atual?.valor ?? null;
      const limpo = valor === null || valor.trim() === "" ? null : valor.trim();
      if (anterior === limpo) continue;
      antes[chave] = anterior;
      depois[chave] = limpo;
      // Apagado volta a ser o campo VAZIO E ASSINALADO, não um campo com origem e sem valor.
      novos[chave] = limpo === null ? { valor: null, origem: null } : { valor: limpo, origem: "digitado" };
    }

    const mudou = Object.keys(depois);
    if (mudou.length === 0) return { salvo: true, mudou: [] };

    await tx
      .update(driverPreregistrations)
      .set({ campos: novos, status: "em_conferencia", updatedAt: new Date() })
      .where(eq(driverPreregistrations.id, id));

    await writeAudit(tx, {
      entityType: "driver_preregistration",
      entityId: id,
      action: "preregistration.reviewed",
      previousValue: antes,
      newValue: depois,
      actorUserId,
    });

    return { salvo: true, mudou };
  });
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

/**
 * `apenasId` restringe a UM pré-cadastro — o botão de uma linha da fila.
 *
 * Ele ESTREITA, nunca afrouxa: as duas condições que impedem o reenvio continuam na cláusula, e é
 * por isso que o filtro mora na CONSULTA e não em JavaScript depois. Um `filter()` em memória é o
 * tipo de coisa que alguém simplifica meses depois sem perceber que era a trava.
 */
export async function candidatosAoCadastro(
  limite = 50,
  apenasId?: string | null,
): Promise<CandidatoAoCadastro[]> {
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
        ...(apenasId ? [eq(driverPreregistrations.id, apenasId)] : []),
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

/**
 * REIVINDICA A LINHA ANTES DE GASTAR (31/08, fatia 028, etapa 6).
 *
 * A pesquisa é COBRADA por solicitação e não existe homologação. Esta função é a única trava que
 * vale: grava `pesquisa_solicitada_em` com `WHERE pesquisa_solicitada_em IS NULL`, e quem conseguir
 * gravar é quem pode chamar.
 *
 * ── POR QUE VERIFICAR ANTES NÃO BASTARIA ──────────────────────────────────────────────────────
 *
 * Entre "olhei e estava livre" e "chamei" cabe a segunda aba, o segundo operador e o duplo-clique.
 * Só a escrita condicional é atômica — o `UPDATE` do Postgres decide sozinho quem chegou primeiro,
 * e o segundo recebe zero linhas.
 *
 * A verificação em `motivosDeNaoPesquisar` continua existindo, mas para EXPLICAR na tela. Ela não
 * garante nada, e o comentário lá diz isso.
 *
 * ── QUEM PEDIU FICA GRAVADO NA MESMA ESCRITA ──────────────────────────────────────────────────
 *
 * Não numa segunda instrução: se a gravação do autor pudesse falhar em separado, existiria um
 * estado em que a linha está reivindicada e o gasto é anônimo — que é exatamente o que estas
 * colunas existem para evitar.
 *
 * Devolve `false` quando alguém chegou antes. Não é erro: é o desfecho normal do segundo clique, e
 * quem chama simplesmente não gasta.
 */
export async function reivindicarPesquisa(id: string, actorUserId: string): Promise<boolean> {
  const linhas = await db
    .update(driverPreregistrations)
    .set({
      pesquisaSolicitadaEm: new Date(),
      pesquisaSolicitadaPor: actorUserId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(driverPreregistrations.id, id),
        isNull(driverPreregistrations.pesquisaSolicitadaEm),
        // Pesquisar quem nunca foi criado na gerenciadora é gastar por nada.
        isNotNull(driverPreregistrations.enviadoEm),
        isNull(driverPreregistrations.arquivadoEm),
      ),
    )
    .returning({ id: driverPreregistrations.id });
  return linhas.length > 0;
}

/**
 * DEVOLVE A REIVINDICAÇÃO quando a chamada NÃO chegou a acontecer.
 *
 * Só para falha ANTES da gerenciadora responder — rede caiu, credencial faltando, corpo recusado
 * pela nossa própria validação. Aí não houve cobrança, e manter a linha reivindicada travaria para
 * sempre um pedido que ninguém fez.
 *
 * ── E NUNCA DEPOIS DE ELA RESPONDER ───────────────────────────────────────────────────────────
 *
 * Se a gerenciadora respondeu qualquer coisa — inclusive erro —, a solicitação pode ter sido
 * contabilizada, e liberar a linha convidaria alguém a pedir de novo. Na dúvida entre travar um
 * pedido legítimo e gastar duas vezes, trava: destravar é uma conversa, a cobrança é uma fatura.
 */
export async function devolverReivindicacaoDaPesquisa(id: string): Promise<void> {
  await db
    .update(driverPreregistrations)
    .set({ pesquisaSolicitadaEm: null, pesquisaSolicitadaPor: null, updatedAt: new Date() })
    .where(eq(driverPreregistrations.id, id));
}

/** O que a gerenciadora respondeu ao pedido de pesquisa, cru, junto do que foi pedido. */
export async function gravarResultadoDaPesquisa(
  id: string,
  actorUserId: string,
  detalhe: Record<string, unknown>,
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
        campos: {
          ...((antes?.campos ?? {}) as Record<string, unknown>),
          pesquisaGerenciadora: { em: new Date().toISOString(), ...detalhe },
        },
        updatedAt: new Date(),
      })
      .where(eq(driverPreregistrations.id, id));

    await writeAudit(tx, {
      entityType: "driver_preregistration",
      entityId: id,
      action: "preregistration.pesquisa_requested",
      previousValue: null,
      newValue: detalhe,
      actorUserId,
    });
  });
}

/**
 * OS ARQUIVOS DE UM PRÉ-CADASTRO, para irem anexados ao `setMotorista` (31/08).
 *
 * O manual exige os documentos quando o cadastro vai para o módulo de Pesquisa e Consulta — coluna
 * `Obr. P&C`, pág. 52 — e é o nosso caso. Sem eles, a pesquisa (a metade que custa) nasce
 * incompleta.
 *
 * Do ÚLTIMO envio, como todo o resto desta tela: se a pessoa mandou de novo por ter tirado uma foto
 * melhor, é a foto nova que deve ir.
 *
 * Devolve a CHAVE e o TIPO, não o binário: baixar é trabalho do worker, que é quem tem a chave de
 * serviço. Esta função responde "quais arquivos", não "o conteúdo deles".
 */
export async function arquivosDoPreCadastro(
  preregistrationId: string,
): Promise<{ chave: string; contentType: string; descricao: string }[]> {
  const [ultimo] = await db
    .select({
      cnh: driverPreregistrationSubmissions.documentoCnhId,
      comprovante: driverPreregistrationSubmissions.documentoComprovanteId,
    })
    .from(driverPreregistrationSubmissions)
    .where(eq(driverPreregistrationSubmissions.preregistrationId, preregistrationId))
    .orderBy(desc(driverPreregistrationSubmissions.recebidoEm))
    .limit(1);

  if (!ultimo) return [];

  /**
   * A DESCRIÇÃO acompanha o id, e não é enfeite: ela é o título que aparece na aba de documentos da
   * gerenciadora. Dois anexos sem nome obrigam quem confere lá a abrir os dois para saber qual é
   * qual — e quem confere lá é a auditoria que decide a pesquisa.
   */
  const alvos = [
    { id: ultimo.cnh, descricao: "CNH" },
    { id: ultimo.comprovante, descricao: "Comprovante de residencia" },
  ].filter((a): a is { id: string; descricao: string } => Boolean(a.id));

  if (alvos.length === 0) return [];

  const linhas = await db
    .select({
      id: resourceDocuments.id,
      chave: resourceDocuments.fileStorageKey,
      contentType: resourceDocuments.contentType,
    })
    .from(resourceDocuments)
    .where(
      inArray(
        resourceDocuments.id,
        alvos.map((a) => a.id),
      ),
    );

  // A ORDEM segue `alvos`, não o que o banco devolveu: a CNH vem primeiro porque é o documento que
  // a auditoria abre primeiro, e um `IN` não promete ordem nenhuma.
  return alvos.flatMap((a) => {
    const l = linhas.find((x) => x.id === a.id);
    return l ? [{ chave: l.chave, contentType: l.contentType, descricao: a.descricao }] : [];
  });
}

/**
 * AS PESQUISAS QUE AINDA ANDAM — para o job agendado perguntar o resultado (31/08, etapa 7).
 *
 * Reivindicadas (`pesquisa_solicitada_em` não nula) e sem desfecho gravado. O desfecho vive em
 * `campos.pesquisaGerenciadora.acabou`, escrito pelo próprio job quando a situação vira AD, NA ou
 * EX — ver `pesquisaAcabou`.
 *
 * O FILTRO É NA CONSULTA, não em JavaScript depois: quando houver centenas de cadastros resolvidos,
 * trazê-los todos para descartar em memória seria varrer a tabela inteira a cada ciclo. É a mesma
 * razão do `candidatosAoCadastro` logo acima.
 */
export async function pesquisasEmAndamento(
  limite = 50,
): Promise<{ id: string; cpf: string; vinculo: string | null }[]> {
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
        isNotNull(driverPreregistrations.pesquisaSolicitadaEm),
        sql`coalesce((${driverPreregistrations.campos} -> 'pesquisaGerenciadora' ->> 'acabou')::boolean, false) = false`,
      ),
    )
    .orderBy(driverPreregistrations.pesquisaSolicitadaEm)
    .limit(limite);

  return linhas.map((l) => {
    const p = ((l.campos ?? {}) as Record<string, unknown>).pesquisaGerenciadora as
      | { vinculo?: string }
      | undefined;
    return { id: l.id, cpf: l.cpf, vinculo: p?.vinculo ?? null };
  });
}
