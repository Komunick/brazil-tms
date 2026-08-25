/**
 * O CLIENTE DA INTEGRA 14.2 — a API da gerenciadora Logae (2026-08-25, fatia 026).
 *
 * Mora no WORKER e não em `packages/`, de propósito: a credencial é de produção e dá escrita no
 * sistema de um fornecedor. O que não pode ser importado pelo app web não pode vazar por uma rota
 * mal escrita. Quem precisar do resultado lê o banco.
 *
 * ── DUAS ESQUISITICES DA API, MEDIDAS E NÃO LIDAS ─────────────────────────────────────────────
 *
 * O nome do método vai NA URL, ENTRE ASPAS: `/TWebService/"getModelosPreSM"`, que escapado vira
 * `%22`. Não é o corpo que escolhe a operação.
 *
 * E o erro não vem no código HTTP: toda resposta é 200, e o que diz se deu certo é `CodErro` — zero
 * significa sucesso — dentro de `result[0]`.
 *
 * ── NÃO EXISTE HOMOLOGAÇÃO PARA NÓS ───────────────────────────────────────────────────────────
 *
 * Medido em 25/08: `Ambiente: "Homologacao"` responde `CodErro 100 — USUARIO INVALIDO`. Só
 * produção funciona, e a gerenciadora COBRA por solicitação. É por isso que este arquivo só expõe
 * LEITURA nesta fatia — a escrita entra na Fase 6, atrás de um interruptor desligado.
 */

const BASE = "https://integra.logae.com.br/datasnap/rest/TWebService";

/**
 * Toda chamada leva estes quatro; o resto varia por método.
 *
 * `type` e não `interface`: o corpo da requisição é montado espalhando as credenciais num objeto
 * genérico, e uma `interface` sem assinatura de índice não é atribuível a `Record<string, unknown>`.
 */
type Credenciais = {
  Ambiente: "Producao";
  Login: string;
  Senha: string;
  TipoRetorno: "JSON";
};

export class IntegraIndisponivel extends Error {
  constructor(readonly detalhe: string) {
    super(`Integra indisponível: ${detalhe}`);
  }
}

export class IntegraRecusou extends Error {
  constructor(
    readonly codErro: number,
    readonly msgErro: string,
  ) {
    super(msgErro || `Integra recusou (CodErro ${codErro})`);
  }
}

/**
 * As credenciais, do ambiente do worker — ou `null` quando não estão configuradas.
 *
 * `null` e não exceção: sem credencial a integração está DESLIGADA, que é um estado legítimo (e o
 * padrão). Quem chama trata isso como "não criei, e o motivo é este", não como falha.
 */
export function credenciaisDaIntegra(): Credenciais | null {
  const Login = process.env.INTEGRA_LOGIN?.trim();
  const Senha = process.env.INTEGRA_SENHA?.trim();
  if (!Login || !Senha) return null;
  return { Ambiente: "Producao", Login, Senha, TipoRetorno: "JSON" };
}

async function chamar<T>(metodo: string, corpo: Record<string, unknown>): Promise<T> {
  // As aspas fazem parte do caminho. Sem elas a API devolve 404 — o nome do método É o recurso.
  const url = `${BASE}/${encodeURIComponent(`"${metodo}"`)}`;

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      // Rede de terceiro pode pendurar. Sem teto, um job fica preso segurando a fila.
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e) {
    throw new IntegraIndisponivel(e instanceof Error ? e.message : "falha de rede");
  }

  if (!resposta.ok) throw new IntegraIndisponivel(`HTTP ${resposta.status}`);

  const json = (await resposta.json()) as { result?: Array<Record<string, unknown>> };
  const r = json.result?.[0];
  if (!r) throw new IntegraIndisponivel("resposta sem `result`");

  const codErro = Number(r.CodErro ?? -1);
  // Zero é sucesso. Qualquer outro valor é recusa DELA, e a mensagem dela é o que vai para a tela —
  // sem tradução nossa (FR-014).
  if (codErro !== 0) throw new IntegraRecusou(codErro, String(r.MsgErro ?? ""));
  return r as T;
}

// ---------------------------------------------------------------------------
// Leitura — o que esta fatia usa
// ---------------------------------------------------------------------------

export interface ModeloPreSM {
  Codigo: number;
  Descricao: string;
}

/** Os modelos de Pré-SM cadastrados. Medido em 25/08: 89, cobrindo 84% das nossas viagens. */
export async function getModelosPreSM(cred: Credenciais): Promise<ModeloPreSM[]> {
  const r = await chamar<{ Modelos?: ModeloPreSM[] }>("getModelosPreSM", cred);
  return r.Modelos ?? [];
}

/**
 * O dono de um veículo, por placa — é o que sugere o vínculo (Fase 4).
 *
 * Carreta NÃO existe aqui: `getVeiculo` responde `CodErro 109` para placa de reboque, que tem
 * cadastro próprio. Ver `getCarreta`.
 */
export async function getVeiculo(
  cred: Credenciais,
  placa: string,
): Promise<{ CNPJProprietario?: string; NumeroFrota?: string } | null> {
  try {
    const r = await chamar<{ Veiculo?: Record<string, string> }>("getVeiculo", {
      ...cred,
      Placa: placa,
    });
    return r.Veiculo ?? null;
  } catch (e) {
    // 109 = não encontrado. É o caso comum de uma placa de carreta consultada como veículo, e não
    // é erro: quem chama tenta a outra tabela.
    if (e instanceof IntegraRecusou && e.codErro === 109) return null;
    throw e;
  }
}

/** O dono de uma carreta. Medido: nem sempre é o mesmo do cavalo. */
export async function getCarreta(
  cred: Credenciais,
  placa: string,
): Promise<{ CNPJProprietario?: string } | null> {
  try {
    const r = await chamar<{ Carreta?: Record<string, string> }>("getCarreta", {
      ...cred,
      Placa: placa,
    });
    return r.Carreta ?? null;
  } catch (e) {
    if (e instanceof IntegraRecusou && e.codErro === 109) return null;
    throw e;
  }
}
