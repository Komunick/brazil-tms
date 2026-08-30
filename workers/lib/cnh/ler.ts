import Anthropic from "@anthropic-ai/sdk";
import { cnhLidaSchema, type CnhLida } from "@brazil-tms/shared";

/**
 * A LEITURA DA CNH — a única parte desta fatia que fala com um provedor externo (etapa 3).
 *
 * A decisão de o que fazer com o resultado é pura e mora em `packages/shared/src/domain/cnh-lida.ts`,
 * sob teste. Aqui fica só o que não dá para testar sem o mundo: montar a chamada e validar o que
 * voltou.
 *
 * ── POR QUE NO WORKER, E NÃO NA ROTA ──────────────────────────────────────────────────────────
 *
 * A rota pública responde em 0,74 s medidos, e é ela que o motorista espera com o celular na mão,
 * num 4G de evento. Ler a CNH leva segundos e custa dinheiro. Pendurar a leitura na rota faria a
 * pessoa esperar por um trabalho que não é dela — e, pior, uma falha do provedor viraria falha do
 * cadastro: o motorista perderia o envio por causa de algo que ele nem sabe que existe.
 *
 * No worker, a leitura pode falhar, ser repetida e demorar, sem que nada disso chegue ao motorista.
 *
 * ── DEGRADAÇÃO LIMPA (herdado da 021, FR-007) ─────────────────────────────────────────────────
 *
 * Sem `ANTHROPIC_API_KEY` isto não estoura: devolve "não configurado" e a fila segue funcionando
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
 * Duas instruções carregam o peso todo, e as duas dizem a MESMA coisa por ângulos diferentes,
 * de propósito: a regra de não inventar é a única que, se falhar, produz um erro invisível.
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

/** Os tipos que a rota pública aceita e que o provedor lê. */
type TipoAceito = "image/jpeg" | "image/png" | "application/pdf";

export async function lerCnh(
  binario: Buffer,
  tipo: string,
  opts: { modelo?: string } = {},
): Promise<ResultadoDaLeitura> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return { estado: "nao_configurado" };

  const aceito = ["image/jpeg", "image/png", "application/pdf"].includes(tipo);
  if (!aceito) return { estado: "falhou", motivo: `tipo não suportado: ${tipo}` };

  const cliente = new Anthropic({ apiKey: chave });
  const base64 = binario.toString("base64");

  /**
   * PDF e imagem entram por blocos DIFERENTES na API. Mandar um PDF como `image` responde com um
   * erro de formato que parece problema do arquivo — e a foto do motorista levaria a culpa.
   */
  const conteudo =
    tipo === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } } as const)
      : ({ type: "image", source: { type: "base64", media_type: tipo as Exclude<TipoAceito, "application/pdf">, data: base64 } } as const);

  try {
    const resposta = await cliente.messages.create({
      model: opts.modelo ?? process.env.CNH_MODELO ?? "claude-sonnet-5",
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
      .join("")
      .trim();

    // Cerca de código apesar da instrução: o modelo às vezes a acrescenta, e recusar por causa dela
    // jogaria fora uma leitura boa por um detalhe de formatação.
    const limpo = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

    let bruto: unknown;
    try {
      bruto = JSON.parse(limpo);
    } catch {
      return { estado: "falhou", motivo: "resposta não era JSON" };
    }

    /**
     * O esquema é a fronteira. Um campo fora do domínio (sexo "X", por exemplo) faz a validação
     * falhar inteira — e isso é melhor do que gravar meia leitura confiável e meia duvidosa sem
     * ninguém saber qual é qual.
     */
    const analise = cnhLidaSchema.safeParse(bruto);
    if (!analise.success) {
      return { estado: "falhou", motivo: `fora do esquema: ${analise.error.issues[0]?.message ?? "?"}` };
    }
    return { estado: "lido", campos: analise.data };
  } catch (erro) {
    // NÃO propaga: quem chama grava a falha no pré-cadastro e a fila continua utilizável com o que
    // o motorista digitou. Uma leitura que falha não pode derrubar um cadastro que já chegou.
    return { estado: "falhou", motivo: erro instanceof Error ? erro.message : String(erro) };
  }
}
