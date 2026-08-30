import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  CNH_JOBS,
  PRE_CADASTRO_TIPOS_ACEITOS,
  preCadastroSchema,
  type CnhLerPayload,
} from "@brazil-tms/shared";
import {
  MuitosEnvios,
  registrarPreCadastro,
  resolvePreCadastroActorId,
} from "@brazil-tms/db";
import { db } from "@brazil-tms/db";
import { resourceDocuments } from "@brazil-tms/db/schema";
import {
  documentsBucket,
  putDocument,
  removeObject,
  resourceDocumentStorageKey,
} from "@/lib/supabase/storage";
import { getBffBoss } from "@/lib/queue/boss";

export const dynamic = "force-dynamic";

/**
 * A ROTA PÚBLICA DO PRÉ-CADASTRO — o motorista preenche, e isto recebe (fatia 028).
 *
 * O contrato está em `specs/028-fila-cadastro-motorista/contracts/pre-cadastro.md` e é o que quem
 * escreve o formulário, no outro repositório, tem em mãos. Aqui só o que o contrato não pode dizer.
 *
 * ── A RESPOSTA É IDÊNTICA NOS TRÊS CASOS DE CPF, POR CONSTRUÇÃO ───────────────────────────────
 *
 * CPF novo, CPF já na fila e CPF de motorista da empresa produzem o MESMO corpo, byte a byte.
 * Diferenciar — no corpo, no código de status ou no tempo — transformaria o formulário numa máquina
 * de descobrir quem é motorista da Brazil Transports: bastaria mandar CPFs e ler o que volta.
 *
 * A garantia não é disciplina, é forma. `registrarPreCadastro` devolve `void`: o caso é decidido lá
 * dentro e **nunca chega aqui**, então não há como esta função vazar o que não recebeu. E o sucesso
 * sai de um literal só, num ponto só do arquivo.
 *
 * Há teste afirmando isso. Se ele cair, não é o teste que está errado.
 *
 * ── SEM SESSÃO, MAS AINDA É O BFF (princípio IV) ──────────────────────────────────────────────
 *
 * O princípio diz que o BFF é a única fonte de autorização. Uma rota sem sessão não o viola — ela É
 * o BFF, e continua sendo o único caminho até o banco. O que muda é a pergunta: em vez de "quem é
 * você", ela pergunta "o que você pode fazer aqui dentro". A resposta é estreita de propósito:
 *
 *   · só ESCREVE, nunca lê — não existe rota pública que consulte pré-cadastro nenhum
 *   · escreve numa tabela que NÃO é `drivers` — nada aqui cria motorista
 *   · REVALIDA TUDO, porque o formulário vive noutro repositório e o navegador não é confiável
 *   · a chave de serviço do Supabase fica no servidor: o arquivo passa por aqui, nunca direto
 *
 * ── O QUE ESTA ROTA NÃO FAZ ───────────────────────────────────────────────────────────────────
 *
 * Não lê a CNH, não consulta CEP, não fala com a gerenciadora. Tudo isso é P2 e nada disso pode
 * atrasar o evento de 10/09, que é a razão de esta rota existir.
 */

/** A única origem que pode chamar. Sem isto, qualquer página na internet posta aqui. */
function origemPermitida(): string {
  return process.env.PRE_CADASTRO_ORIGEM ?? "https://braziltransports.com.br";
}

function cabecalhosCors(origem: string | null): Record<string, string> {
  const permitida = origemPermitida();
  // Ecoa a origem SÓ quando ela é a permitida. Devolver `*` funcionaria e abriria a rota para
  // qualquer página; devolver a origem recebida sem conferir seria o mesmo com passos a mais.
  return {
    "Access-Control-Allow-Origin": origem === permitida ? permitida : permitida,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export function OPTIONS(request: Request): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: cabecalhosCors(request.headers.get("origin")),
  });
}

function tetoBytes(): number {
  const v = Number(process.env.DOCUMENT_MAX_BYTES);
  return Number.isFinite(v) && v > 0 ? v : 10 * 1024 * 1024;
}

/** Extensão a partir do tipo aceito — a validação de tipo já aconteceu antes. */
const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

/**
 * O tipo do arquivo sai do CONTEÚDO declarado e do nome, e os dois precisam bater com a lista.
 * Um `.jpg` com `content-type` de outra coisa é recusado em vez de adivinhado: a foto vai ser aberta
 * por uma pessoa na conferência, e um arquivo que o navegador dela não abre é um cadastro perdido
 * sem ninguém saber por quê.
 */
function tipoAceito(file: File): string | null {
  const ct = (file.type ?? "").toLowerCase();
  const aceito = (PRE_CADASTRO_TIPOS_ACEITOS as readonly string[]).includes(ct);
  return aceito ? ct : null;
}

/**
 * O HASH da origem, nunca o IP.
 *
 * Para conter repetição basta saber que é A MESMA origem; saber QUAL é dado pessoal que não
 * precisamos guardar. O sal vem da configuração para que o hash não seja reversível por força bruta
 * — o espaço de IPv4 inteiro cabe numa tabela, e sem sal isto guardaria o IP com passos extras.
 */
function hashDaOrigem(request: Request): string | null {
  const bruto =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  if (!bruto) return null;
  const sal = process.env.PRE_CADASTRO_HASH_SALT ?? "";
  return createHash("sha256").update(`${sal}:${bruto}`).digest("hex");
}

type Recusa = { erro: string; campo?: string };

export async function POST(request: Request): Promise<NextResponse> {
  const cors = cabecalhosCors(request.headers.get("origin"));
  const enviados: string[] = [];

  /**
   * Uma recusa nunca é sobre o CPF EXISTIR. Todos os motivos abaixo são de FORMA — campo faltando,
   * tipo de arquivo, tamanho. Nenhum deles muda conforme quem está por trás do CPF, e é isso que
   * mantém a resposta indistinguível.
   */
  const recusar = (status: number, corpo: Recusa): NextResponse =>
    NextResponse.json(corpo, { status, headers: cors });

  try {
    if (request.headers.get("origin") !== origemPermitida()) {
      return recusar(403, { erro: "origem_nao_permitida" });
    }

    // Recusa o corpo grande ANTES de bufferizar. O teto por arquivo, abaixo, é a rede de segurança.
    const declarado = Number(request.headers.get("content-length") ?? 0);
    if (declarado > tetoBytes() * 2 + 64 * 1024) {
      return recusar(400, { erro: "arquivo_grande" });
    }

    /**
     * Corpo que não é `multipart/form-data` é erro de QUEM CHAMA, e precisa sair como 400.
     *
     * Sem este `try`, o `formData()` estoura e cai no `catch` lá embaixo, que responde 500. Além de
     * contrariar o contrato, um 500 diz "a culpa é nossa": ele entra no monitoramento como falha do
     * servidor e some no meio de erros de verdade — e quem está do outro lado, depurando o
     * formulário, conclui que o TMS está fora do ar.
     */
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return recusar(400, { erro: "campo_faltando" });
    }

    const analise = preCadastroSchema.safeParse({
      nome: form.get("nome"),
      cpf: form.get("cpf"),
      celular: form.get("celular"),
      cep: form.get("cep"),
      numero: form.get("numero") ?? undefined,
      possuiMopp: form.get("possuiMopp"),
      validadeMopp: form.get("validadeMopp") ?? undefined,
      possuiToxicologico: form.get("possuiToxicologico"),
      validadeToxicologico: form.get("validadeToxicologico") ?? undefined,
      ciencia: form.get("ciencia"),
    });
    if (!analise.success) {
      const primeiro = analise.error.issues[0];
      const campo = primeiro?.path?.[0];
      // Traduz o campo em erro do contrato. `sem_ciencia_de_erro` é o balde do que não tem nome
      // próprio — visível e honesto, em vez de um 400 mudo que ninguém consegue depurar do estande.
      const nomeado: Record<string, string> = {
        cpf: "cpf_invalido",
        celular: "celular_invalido",
        cep: "cep_invalido",
        validadeMopp: "data_invalida",
        validadeToxicologico: "data_invalida",
        ciencia: "ciencia_ausente",
      };
      const erro =
        typeof campo === "string"
          ? (nomeado[campo] ?? (primeiro?.code === "invalid_type" ? "campo_faltando" : "sem_ciencia_de_erro"))
          : "sem_ciencia_de_erro";
      return recusar(400, typeof campo === "string" ? { erro, campo } : { erro });
    }

    const cnh = form.get("cnh");
    const comprovante = form.get("comprovante");
    if (!(cnh instanceof File) || !(comprovante instanceof File)) {
      return recusar(400, { erro: "campo_faltando", campo: cnh instanceof File ? "comprovante" : "cnh" });
    }
    for (const [campo, file] of [
      ["cnh", cnh],
      ["comprovante", comprovante],
    ] as const) {
      if (!tipoAceito(file)) return recusar(400, { erro: "arquivo_tipo", campo });
      if (file.size > tetoBytes()) return recusar(400, { erro: "arquivo_grande", campo });
    }

    const dados = analise.data;
    const actorUserId = await resolvePreCadastroActorId();

    /*
     * ── AS FOTOS SOBEM ANTES DA LINHA, e por quê ──────────────────────────────────────────────
     *
     * Um binário no bucket sem linha no banco é lixo que uma varredura limpa. Uma linha no banco
     * apontando para um binário que não subiu é um cadastro que a conferência abre e não vê nada —
     * e que ninguém sabe que está quebrado até alguém tentar.
     *
     * O dono é a SUBMISSÃO, não um motorista: o id é sorteado aqui e a chave de storage nasce sob
     * `resources/preregistration/…`. Pendurar num `drivers` inventado seria criar cadastro de
     * motorista a partir de formulário público.
     */
    const donoId = randomUUID();
    const documentos: string[] = [];
    for (const [docType, file] of [
      ["cnh", cnh],
      ["comprovante", comprovante],
    ] as const) {
      const contentType = tipoAceito(file)!;
      const documentId = randomUUID();
      const key = resourceDocumentStorageKey("preregistration", donoId, documentId, EXTENSAO[contentType]!);
      await putDocument(key, Buffer.from(await file.arrayBuffer()), contentType);
      enviados.push(key);
      await db.insert(resourceDocuments).values({
        id: documentId,
        entityType: "preregistration",
        entityId: donoId,
        docType,
        fileName: file.name.slice(0, 255),
        contentType,
        sizeBytes: file.size,
        fileStorageKey: key,
        uploadedByUserId: actorUserId,
      });
      documentos.push(documentId);
    }

    await registrarPreCadastro({
      cpf: dados.cpf,
      // O CRU, exatamente como chegou — o normalizado vive no pré-cadastro. É o que responde "o que
      // ele mandou?" depois de alguém corrigir na conferência.
      dados: { ...dados, donoDosDocumentos: donoId },
      origemHash: hashDaOrigem(request),
      documentoCnhId: documentos[0]!,
      documentoComprovanteId: documentos[1]!,
    });

    /**
     * A LEITURA DA CNH vai para a fila, e o cadastro NÃO depende dela.
     *
     * Depois de gravar, nunca antes: enfileirar um documento cujo envio falhou deixaria o worker
     * procurando um pré-cadastro que não existe.
     *
     * E o `catch` vazio é deliberado. A leitura é uma melhoria sobre um fluxo que já funciona sem
     * ela — o motorista já se cadastrou, a fila já mostra o que ele digitou. Se a fila de jobs
     * estiver fora do ar, ele NÃO pode perder o cadastro por causa disso. O preço é um pré-cadastro
     * que chega sem os campos lidos, e que alguém confere à mão, como se faz hoje.
     */
    try {
      const boss = await getBffBoss();
      await boss.send(CNH_JOBS.cnhLer, { documentoId: documentos[0]! } satisfies CnhLerPayload);
    } catch (erro) {
      console.error("[pre-cadastro] não foi possível enfileirar a leitura da CNH", erro);
    }

    /*
     * ── O ÚNICO PONTO DE SAÍDA DE SUCESSO ─────────────────────────────────────────────────────
     *
     * Um literal fixo. Não há variável, nem campo condicional, nem nada que dependa do que
     * aconteceu com o CPF. Acrescentar aqui um "já estava na fila" útil é reabrir o vazamento.
     */
    return NextResponse.json({ recebido: true }, { status: 202, headers: cors });
  } catch (error) {
    // O binário já subido não fica órfão quando a linha falha (padrão da 008/025).
    for (const key of enviados) {
      try {
        await removeObject(key, documentsBucket());
      } catch {
        /* limpeza de melhor esforço: o erro original é o que importa */
      }
    }
    if (error instanceof MuitosEnvios) {
      return NextResponse.json({ erro: "muitos_envios" }, { status: 429, headers: cors });
    }
    console.error("[pre-cadastro] falha ao receber envio", error);
    return NextResponse.json({ erro: "falha_interna" }, { status: 500, headers: cors });
  }
}
