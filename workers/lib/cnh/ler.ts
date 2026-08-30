import Anthropic from "@anthropic-ai/sdk";
import { cnhLidaSchema, type CnhLida } from "@brazil-tms/shared";

/**
 * A LEITURA DA CNH — a única parte desta fatia que fala com um provedor externo (etapa 3).
 *
 * A decisão de o que fazer com o resultado é pura e mora em `packages/shared/src/domain/cnh-lida.ts`,
 * sob teste. Aqui fica só o que não dá para testar sem o mundo: montar a chamada e validar o que
 * voltou.
 *
 * ── DOIS PROVEDORES, ESCOLHIDOS POR VARIÁVEL ──────────────────────────────────────────────────
 *
 * `GROQ_API_KEY` → Groq (camada gratuita, API compatível com OpenAI)
 * `ANTHROPIC_API_KEY` → Anthropic
 * nenhuma → `nao_configurado`, e o cadastro segue conferível à mão
 *
 * O Groq vem primeiro quando as duas existem: é o gratuito, e a escolha de gastar deve ser
 * deliberada, nunca o padrão.
 *
 * Só ESTE arquivo sabe qual provedor é. Quem decide alguma coisa — o que conta como lido, a data
 * virando ISO, o CPF conferido contra o digitado — não sabe e não precisa saber.
 *
 * ── ⚠️ PDF: A DIFERENÇA QUE PODE DECIDIR A ESCOLHA ────────────────────────────────────────────
 *
 * A Anthropic lê PDF nativamente. A API compatível com OpenAI, que é a do Groq, aceita IMAGEM —
 * e não há bloco de documento equivalente.
 *
 * Isso importa mais do que parece aqui: o formulário pede, em primeiro lugar, **o PDF gerado no
 * aplicativo Carteira Digital de Trânsito**, porque é o formato que sai perfeito. Se o Groq não
 * lê PDF, ele não lê justamente o que a gente está pedindo.
 *
 * Por isso o PDF no Groq devolve uma falha COM MOTIVO EXPLÍCITO, em vez de um erro genérico do
 * provedor: quem olhar a fila precisa entender que o problema é o formato, não a foto.
 *
 * ── DEGRADAÇÃO LIMPA (herdado da 021, FR-007) ─────────────────────────────────────────────────
 *
 * Sem credencial nenhuma isto não estoura: devolve "não configurado" e a fila segue funcionando
 * com os campos que o motorista digitou. A leitura é uma melhoria sobre um fluxo que já funciona
 * sem ela — nunca um pré-requisito dele.
 */

export type ResultadoDaLeitura =
  | { estado: "lido"; campos: CnhLida }
  | { estado: "nao_configurado" }
  | { estado: "falhou"; motivo: string };

/**
 * O pedido ao modelo.
 *
 * A regra de não inventar aparece duas vezes, por ângulos diferentes, de propósito: é a única que,
 * se falhar, produz um erro invisível — um campo plausível e errado atravessa a conferência.
 */
const INSTRUCAO = [
  "Você lê CNHs brasileiras e devolve os campos impressos nelas.",
  "",
  "REGRA ABSOLUTA: se um campo não estiver legível, não estiver presente, ou você tiver qualquer",
  "dúvida sobre ele, devolva null. NUNCA deduza, complete ou invente um valor plausível.",
  "Um campo vazio é um resultado correto; um campo com valor errado é um defeito grave, porque",
  "ninguém confere aquilo que parece certo.",
  "",
  "Datas: devolva no formato DD/MM/AAAA exatamente como impresso, com o ano de quatro dígitos.",
  "Se o ano estiver com dois dígitos ou ilegível, devolva null — não complete o século.",
  "CPF: apenas os dígitos, sem pontuação.",
  "Sexo: 'M' ou 'F'. Qualquer outra coisa, null.",
  "Nomes: exatamente como impressos, em maiúsculas, sem corrigir grafia.",
  "",
  "Responda SOMENTE com o objeto JSON, sem texto antes ou depois, sem cercas de código.",
].join("\n");

const CHAVES: ReadonlyArray<keyof CnhLida> = [
  "nome", "cpf", "dataNascimento", "sexo", "rg", "orgaoEmissorRg", "ufEmissorRg", "nomeMae",
  "nomePai", "cidadeNatal", "ufNatal", "numeroRegistro", "numeroFormulario", "numeroSeguranca",
  "renach", "categoria", "validade", "primeiraHabilitacao",
];

/** O formato pedido, listado no texto: modelo aberto costuma respeitar melhor quando vê as chaves. */
const FORMATO = `Campos: ${CHAVES.join(", ")}.`;

const TIPOS = ["image/jpeg", "image/png", "application/pdf"];

/**
 * O texto vira objeto validado — ou uma falha com motivo.
 *
 * O esquema é a fronteira: um campo fora do domínio (sexo "X") faz a validação falhar inteira, e
 * isso é melhor do que gravar meia leitura confiável e meia duvidosa sem ninguém saber qual é qual.
 */
function interpretar(texto: string): ResultadoDaLeitura {
  // Cerca de código apesar da instrução: o modelo às vezes a acrescenta, e recusar por causa dela
  // jogaria fora uma leitura boa por um detalhe de formatação.
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let bruto: unknown;
  try {
    bruto = JSON.parse(limpo);
  } catch {
    return { estado: "falhou", motivo: "resposta não era JSON" };
  }
  const analise = cnhLidaSchema.safeParse(bruto);
  if (!analise.success) {
    return { estado: "falhou", motivo: `fora do esquema: ${analise.error.issues[0]?.message ?? "?"}` };
  }
  return { estado: "lido", campos: analise.data };
}

/** Groq — API compatível com OpenAI. Só imagem; ver o bloco sobre PDF no topo. */
async function lerNoGroq(binario: Buffer, tipo: string, chave: string): Promise<ResultadoDaLeitura> {
  if (tipo === "application/pdf") {
    return {
      estado: "falhou",
      motivo:
        "PDF não é suportado por este provedor (só imagem). O formulário pede o PDF do aplicativo " +
        "em primeiro lugar — este cadastro precisa de conferência à mão, ou de um provedor que leia PDF.",
    };
  }
  const resposta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: process.env.CNH_MODELO ?? "qwen/qwen3.8-27b",
      temperature: 0,
      // O provedor garante JSON, em vez de a gente torcer para o texto sair limpo.
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${INSTRUCAO}\n${FORMATO}` },
        {
          role: "user",
          content: [
            { type: "text", text: "Leia esta CNH e devolva o JSON dos campos." },
            { type: "image_url", image_url: { url: `data:${tipo};base64,${binario.toString("base64")}` } },
          ],
        },
      ],
    }),
    // Rede de terceiro pode pendurar. Sem teto, um job fica preso segurando a fila.
    signal: AbortSignal.timeout(90_000),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    return { estado: "falhou", motivo: `Groq HTTP ${resposta.status}: ${corpo.slice(0, 200)}` };
  }
  const json = (await resposta.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const texto = json.choices?.[0]?.message?.content ?? "";
  return texto ? interpretar(texto) : { estado: "falhou", motivo: "resposta vazia" };
}

/** Anthropic — lê PDF nativamente, pelo bloco `document`. */
async function lerNaAnthropic(
  binario: Buffer,
  tipo: string,
  chave: string,
): Promise<ResultadoDaLeitura> {
  const base64 = binario.toString("base64");
  /**
   * PDF e imagem entram por blocos DIFERENTES. Mandar um PDF como `image` responde com um erro de
   * formato que parece problema do arquivo — e a foto do motorista levaria a culpa.
   */
  const conteudo =
    tipo === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as const)
      : ({ type: "image", source: { type: "base64", media_type: tipo as "image/jpeg" | "image/png", data: base64 } } as const);

  const resposta = await new Anthropic({ apiKey: chave }).messages.create({
    model: process.env.CNH_MODELO ?? "claude-sonnet-5",
    max_tokens: 1500,
    system: INSTRUCAO,
    messages: [
      {
        role: "user",
        content: [conteudo, { type: "text", text: "Leia esta CNH e devolva o JSON dos campos." }],
      },
    ],
  });
  const texto = resposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return texto ? interpretar(texto) : { estado: "falhou", motivo: "resposta vazia" };
}

export async function lerCnh(binario: Buffer, tipo: string): Promise<ResultadoDaLeitura> {
  const groq = process.env.GROQ_API_KEY?.trim();
  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  if (!groq && !anthropic) return { estado: "nao_configurado" };
  if (!TIPOS.includes(tipo)) return { estado: "falhou", motivo: `tipo não suportado: ${tipo}` };

  try {
    // O gratuito primeiro: gastar deve ser uma escolha, nunca o padrão.
    return groq ? await lerNoGroq(binario, tipo, groq) : await lerNaAnthropic(binario, tipo, anthropic!);
  } catch (erro) {
    // NÃO propaga: quem chama grava a falha no pré-cadastro e a fila continua utilizável com o que
    // o motorista digitou. Uma leitura que falha não pode derrubar um cadastro que já chegou.
    return { estado: "falhou", motivo: erro instanceof Error ? erro.message : String(erro) };
  }
}
