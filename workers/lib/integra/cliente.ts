/**
 * O CLIENTE DA INTEGRA 14.2 — a API da gerenciadora Logae (2026-08-25, fatia 026).
 *
 * Mora no WORKER e não em `packages/`, de propósito: a credencial é de produção e dá escrita no
 * sistema de um fornecedor. O que não pode ser importado pelo app web não pode vazar por uma rota
 * mal escrita. Quem precisar do resultado lê o banco.
 *
 * ── DUAS ESQUISITICES DA API, MEDIDAS E NÃO LIDAS ─────────────────────────────────────────────
 *
 * O nome do método vai NA URL, ENTRE ASPAS: `/TWebService/"getRotas"`, que escapado vira
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

/**
 * O LIMITE DE FREQUÊNCIA DELA — `CodErro 102`, e por que ele merece espera e não falha (2026-09-02).
 *
 * A gerenciadora recusa chamadas próximas demais com "CONSUMO INDEVIDO. 30 segundos" e o segundo
 * exato vem na mensagem. Não é dado errado nem indisponibilidade: é ela pedindo para esperar.
 *
 * ACONTECEU DE VERDADE no primeiro cadastro real: três tentativas seguidas morreram nisso
 * (13:49:30, 13:49:42, 13:50:37) e só a quarta passou. Deu certo porque o usuário insistiu à mão —
 * e insistência não é estratégia numa leva de cinquenta motoristas.
 *
 * A credencial é UMA e é compartilhada: o robô de posições consulta de dois em dois minutos com a
 * mesma. Então a colisão não é acidente raro, é o funcionamento normal do sistema.
 *
 * DUAS ESPERAS, NO MÁXIMO. O suficiente para atravessar a janela que ela pede; mais que isso seria
 * um job pendurado por minutos, e o pg-boss já tem repetição própria para o que não passa.
 */
const COD_ERRO_CONSUMO_INDEVIDO = 102;
const ESPERAS_NO_LIMITE = 2;

/** "CONSUMO INDEVIDO. 30 segundos" → 30. Sem número na frase, espera o padrão de 30 s. */
export function segundosDeEspera(msg: string): number {
  const n = /(\d+)\s*segundo/i.exec(msg);
  return n ? Number(n[1]) : 30;
}

async function chamar<T>(
  metodo: string,
  corpo: Record<string, unknown>,
  esperasRestantes = ESPERAS_NO_LIMITE,
): Promise<T> {
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
  if (codErro === COD_ERRO_CONSUMO_INDEVIDO && esperasRestantes > 0) {
    /*
      ESPERA E TENTA DE NOVO, em vez de derrubar o job.

      O `console.warn` fica: uma espera silenciosa esconderia que a credencial está disputada, e é
      justamente isso que alguém vai querer saber quando a fila começar a demorar.
    */
    const segundos = segundosDeEspera(String(r.MsgErro ?? ""));
    console.warn(`[integra] ${metodo}: limite de consumo, esperando ${segundos}s`);
    await new Promise((ok) => setTimeout(ok, segundos * 1000));
    return chamar<T>(metodo, corpo, esperasRestantes - 1);
  }
  if (codErro !== 0) throw new IntegraRecusou(codErro, String(r.MsgErro ?? ""));
  return r as T;
}

// ---------------------------------------------------------------------------
// Leitura — o que esta fatia usa
// ---------------------------------------------------------------------------

export interface RotaDaGerenciadora {
  Codigo: number;
  Descricao: string;
  CodIBGECidadeOrigem: number;
  CidadeOrigem: string;
  CodIBGECidadeDestino: number;
  CidadeDestino: string;
  KMDistancia?: number;
}

/**
 * TODAS as rotas cadastradas para o cliente. Medido em 25/08: **518**.
 *
 * Chamado **sem** origem e destino, ele lista tudo — é o que o próprio manual diz, e é o atalho que
 * evita uma chamada por rota nossa. As 518 vêm com `CodIBGECidadeOrigem` e `CodIBGECidadeDestino`,
 * que é o par pelo qual o casamento acontece.
 *
 * `DetalharRota: "N"` e `DevolverKML: "N"` de propósito: a lista completa com KML seria megabytes
 * de coordenadas que ninguém usa aqui.
 */
export async function getRotas(cred: Credenciais): Promise<RotaDaGerenciadora[]> {
  const r = await chamar<{ Rotas?: RotaDaGerenciadora[] }>("getRotas", {
    ...cred,
    DevolverKML: "N",
    DetalharRota: "N",
  });
  return r.Rotas ?? [];
}

export interface CidadeDaGerenciadora {
  CodIBGE: number;
  Cidade: string;
  Estado: string;
  UF: string;
  Pais: string;
}

/**
 * O catálogo de cidades. Medido em 25/08 com `FiltroPais: "BR"`: **5.571**.
 *
 * ── OS NOMES DOS FILTROS SÃO ARMADILHA ────────────────────────────────────────────────────────
 *
 * São `FiltroCidade`, `FiltroEstado` e `FiltroPais` — **não** `Cidade` e `UF`. Chamar com os nomes
 * errados não dá erro: a API ignora o que não reconhece e devolve o catálogo inteiro, com cidades
 * de outros países. Isso me fez concluir, por horas, que o método "ignorava o filtro".
 *
 * ── E NÃO CONFUNDIR COM `getTabela(CIDADES)` ──────────────────────────────────────────────────
 *
 * Aquele devolve `{Codigo, Descricao}` com código **interno**, que não casa com o `CodIBGE` que o
 * `getRotas` usa. Trocar a fonte leva a **0% de correspondência** — e sem sintoma nenhum: só uma
 * lista vazia que parece cadastro faltando.
 */
export async function getCidades(cred: Credenciais): Promise<CidadeDaGerenciadora[]> {
  const r = await chamar<{ Cidades?: CidadeDaGerenciadora[] }>("getCidades", {
    ...cred,
    FiltroPais: "BR",
  });
  return r.Cidades ?? [];
}

/**
 * Uma tabela de apoio da gerenciadora, pelo NOME dela.
 *
 * O parâmetro é **`NomeTabela`**, não `Tabela`. Errar isso devolve `CodErro 105` com a lista de
 * valores aceitos **truncada em 250 caracteres** — e a truncagem esconde justamente `FILIAIS` e
 * `PERFIL_SEGURANCA`, o que faz parecer que as tabelas não existem. Custou horas.
 *
 * As duas que esta fatia usa, com os valores medidos em 25/08:
 *   `FILIAIS`           → `9332`  · `03571231000143 - BRAZIL TRANSPORTS LTDA`
 *   `PERFIL_SEGURANCA`  → `20785` · `DDR SHOPEE` (o mesmo que aparece na tela deles)
 */
export async function getTabela(
  cred: Credenciais,
  nomeTabela: string,
): Promise<{ Codigo: string; Descricao: string }[]> {
  const r = await chamar<{ Linhas?: { Codigo: string; Descricao: string }[] }>("getTabela", {
    ...cred,
    NomeTabela: nomeTabela,
  });
  return r.Linhas ?? [];
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

// ---------------------------------------------------------------------------
// Escrita — atrás do interruptor. Ver R1 em `specs/026-pre-sm-logae/research.md`.
// ---------------------------------------------------------------------------

/**
 * CADASTRA UM MOTORISTA (fatia 028, etapa 5).
 *
 * ── ESTA ESCRITA NÃO CUSTA, e é a única do arquivo que não custa ──────────────────────────────
 *
 * Confirmado pelo usuário em 29/08: o `setMotorista` é **de graça**; a cobrança é da
 * `setSolicitacaoPesquisaConsulta`. Isso separa esta fatia em duas metades de risco muito
 * diferentes, e é a decisão D7 do plano.
 *
 * Toda a cautela que a 026 carrega — interruptor, teto diário, uma por vez — nasceu do dinheiro, e
 * NÃO se aplica aqui. Copiá-la seria repetir uma precaução sem o motivo dela.
 *
 * ── MAS "DE GRAÇA" NÃO É "SEM CONSEQUÊNCIA" ───────────────────────────────────────────────────
 *
 * Cada chamada cria uma PESSOA REAL no cadastro da gerenciadora, e não há homologação (`CodErro
 * 100`, medido). Um engano não gera fatura — gera registro sujo que alguém terá de limpar. Quem
 * chama precisa ter CPF de gente que vai mesmo ser cadastrada.
 *
 * Devolve o retorno cru: quem chama grava o que veio, sem tradução nossa.
 */
export async function setMotorista(
  cred: Credenciais,
  motorista: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return chamar<Record<string, unknown>>("setMotorista", { ...cred, Motorista: motorista });
}

/**
 * PEDE A PESQUISA DE UM MOTORISTA (2026-08-31, fatia 028, etapa 6).
 *
 * ⚠️ **Isto CUSTA DINHEIRO.** É a outra metade da fatia: o `setMotorista` acima é de graça e cria a
 * pessoa; esta chamada é a que a gerenciadora cobra, por solicitação. Não existe homologação
 * (`CodErro 100`, medido), então a PRIMEIRA execução já é uma cobrança real.
 *
 * Por isso ela não tem job de varredura e nunca é chamada por um laço: só por um clique, com quem
 * apertou gravado ANTES da chamada e com a linha reivindicada por `WHERE pesquisa_solicitada_em IS
 * NULL` — ver `reivindicarPesquisa`. Automatizar gasto é como uma conta cresce sem ninguém decidir.
 *
 * ── OS PARÂMETROS QUE MUDAM O PREÇO NÃO TÊM PADRÃO AQUI ───────────────────────────────────────
 *
 * `Expressa`, `PesquisaPlus` e `PesquisaBiometrica` são S/N e cada um encarece. Esta função não
 * escolhe nenhum: quem chama passa o que a pessoa marcou na tela. Um padrão escondido aqui seria
 * dinheiro gasto por uma decisão que ninguém tomou.
 *
 * ── O RETORNO TRAZ MAIS DO QUE "DEU CERTO" ───────────────────────────────────────────────────
 *
 * `Codigo` é o número da pesquisa — é por ele que se acompanha o desfecho depois, com o
 * `getResultadoPesquisaConsulta`. `Situacao` diz em que pé está (EP em pesquisa, AD adequado ao
 * risco, NA inconclusivo…). E `PhotocheckUrl` é um link que o CONDUTOR precisa abrir para validar
 * a biometria — se ele vier e ninguém mandar ao motorista, a pesquisa fica parada esperando algo
 * que ele não sabe que existe.
 */
export async function setSolicitacaoPesquisaConsulta(
  cred: Credenciais,
  pedido: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return chamar<Record<string, unknown>>("setSolicitacaoPesquisaConsulta", { ...cred, ...pedido });
}

/**
 * CRIA A PRÉ-SM (2026-08-26, fatia 027).
 *
 * ⚠️ **Isto CUSTA DINHEIRO.** A gerenciadora cobra por solicitação, e não existe ambiente de
 * homologação para nós (`CodErro 100`, medido). Quem chama tem de ter passado pelo interruptor e
 * pelo teto diário — ver `workers/jobs/pre-sm/index.ts`.
 *
 * ── POR QUE `setPreSM` E NÃO `setPreSMdeModelo` ───────────────────────────────────────────────
 *
 * A gerenciadora respondeu por escrito em 25/08, à pergunta sobre o vínculo com a programação do
 * eTorre: **"Tem que ser pelo setPreSM"**. A fatia 026 tinha escolhido o outro, e ele morreu junto
 * com o catálogo de modelos.
 *
 * ── O CORPO VEM PRONTO ────────────────────────────────────────────────────────────────────────
 *
 * Montá-lo é trabalho de `montarCorpoDoSetPreSM`, puro e testado. Este arquivo não decide nada
 * sobre conteúdo: ele fala com a rede, e é só isso que não dá para testar sem o mundo.
 *
 * Devolve o código da Pré-SM criada. Sem ele não há como consultar, alterar ou cancelar depois, e a
 * solicitação vira órfã do nosso lado — paga e invisível.
 */
export async function setPreSM(
  cred: Credenciais,
  corpo: Record<string, unknown>,
): Promise<{ codigo: number | null }> {
  const r = await chamar<{ PreSM?: { Codigo?: number }; Codigo?: number }>("setPreSM", {
    ...cred,
    ...corpo,
  });
  // A documentação mostra o código sob `PreSM`, mas a resposta real de outros métodos às vezes o
  // traz na raiz. Aceitar os dois evita perder o código por uma diferença de formato — e perder o
  // código é perder o controle sobre algo já cobrado.
  const codigo = r.PreSM?.Codigo ?? r.Codigo ?? null;
  return { codigo: typeof codigo === "number" ? codigo : null };
}

/** O estado atual de uma Pré-SM (FR-016). */
export async function getStatusPreSM(
  cred: Credenciais,
  codigo: number,
): Promise<{ status: string | null }> {
  const r = await chamar<{ Status?: string; StatusPreSM?: string }>("getStatusPreSM", {
    ...cred,
    CodPreSolicitacao: codigo,
  });
  return { status: r.Status ?? r.StatusPreSM ?? null };
}

/**
 * CANCELA uma Pré-SM ainda não efetivada (FR-017).
 *
 * Sem ambiente de teste, este método é a **única forma de desfazer** uma criação errada. É por isso
 * que ele entra na mesma fatia da criação, e não numa seguinte.
 */
export async function setCancelaPreSM(cred: Credenciais, codigo: number): Promise<void> {
  await chamar("setCancelaPreSM", { ...cred, CodPreSolicitacao: codigo });
}

export interface PosicaoDaGerenciadora {
  CodPosicao: number;
  Placa: string;
  CodTerminal?: string;
  TipoRastreador?: string;
  DataHoraPos?: string;
  Ignicao?: string;
  Latitude?: number | string;
  Longitude?: number | string;
  PosReferencia?: string;
  /**
   * KM/H. VEM SÓ QUANDO O VEÍCULO ESTÁ ANDANDO — medido: 37 de 108, nenhuma com zero.
   *
   * Ausência não é "parado", é "sem valor". Quem decide movimento é a ignição junto com isto.
   */
  Velocidade?: number | string;
  VeloMediaCalc?: number | string;
  /** KM desde a posição anterior. Veio em 108 de 108. */
  DistUltPosicao?: number | string;
  Cidade?: string;
  UF?: string;
  Pais?: string;
  /** O CPF do motorista vinculado — NÃO o nome, apesar do rótulo. Ver o comentário abaixo. */
  Motorista?: string;
}

/**
 * A ÚLTIMA POSIÇÃO DE CADA VEÍCULO MONITORADO (2026-08-26, a pedido).
 *
 * Medido em 26/08 contra a produção: **91 veículos**, 89 com coordenada válida, e **82 com posição
 * de menos de uma hora**. É a frota que a gerenciadora monitora — não as 936 placas que o portal
 * usa, e sim as que têm rastreador cadastrado com ela.
 *
 * ── `TipoConsulta` MUDA TUDO ──────────────────────────────────────────────────────────────────
 *
 * `Ultimas` devolve a última posição de cada veículo ativo, que é o que interessa a quem pergunta
 * "onde está a frota agora". As outras duas paginam o HISTÓRICO: `Primeiras` traz 500 posições das
 * últimas 72 horas, e `Proximas` continua de onde `CodUltPosicao` parou. Pedir `Primeiras` aqui
 * traria centenas de linhas do mesmo caminhão e nenhuma resposta.
 *
 * `CodUltPosicao: "0"` deixa o controle com a gerenciadora, como o manual permite.
 *
 * ── O CAMPO `Motorista` TRAZ CPF, NÃO NOME ────────────────────────────────────────────────────
 *
 * Conferido nos 91: vêm `08004345441`, `30951722816` — onze dígitos. O rótulo engana e o conteúdo
 * é melhor do que ele promete: CPF é chave estável, e casar por CPF evita o casamento por nome,
 * que é frágil e já custou caro nesta base.
 *
 * ── E NEM TUDO QUE VOLTA PRESTA ───────────────────────────────────────────────────────────────
 *
 * Dois dos 91 vieram com latitude e longitude ZERO e sem data. Zero-zero é uma coordenada válida no
 * Atlântico, ao largo da África — se passar adiante, aparece no mapa como um caminhão no meio do
 * oceano. Quem consome precisa descartar.
 *
 * É LEITURA: não custa solicitação. Pode ser chamado à vontade.
 */
export async function getPosicoes(cred: Credenciais): Promise<PosicaoDaGerenciadora[]> {
  const r = await chamar<{ Posicoes?: PosicaoDaGerenciadora[] }>("getPosicoes", {
    ...cred,
    TipoConsulta: "Ultimas",
    CodUltPosicao: "0",
  });
  return r.Posicoes ?? [];
}

export interface RotaComKML extends RotaDaGerenciadora {
  KML?: string;
  KMDistancia?: number;
}

/**
 * UMA ROTA COM A GEOMETRIA — é daqui que sai a coordenada das estações (2026-08-26).
 *
 * `DevolverKML: "S"` devolve a rota inteira em KML: medido em 26/08, **11.440 pontos e 340 KB** numa
 * rota de 1.553 km. O primeiro ponto é a origem e o último é o destino, e ambos caem sobre
 * instalações logísticas reais.
 *
 * ── O CUSTO É DE PACIÊNCIA, NÃO DE DINHEIRO ───────────────────────────────────────────────────
 *
 * É leitura: não gasta solicitação. Mas a gerenciadora recusa chamadas com menos de DEZ SEGUNDOS de
 * intervalo ("CONSUMO INDEVIDO. 10 segundos"), então quem varre precisa ir devagar. E são 340 KB por
 * resposta para extrair dois pontos — desperdício de banda que não é nosso: é o formato deles, e não
 * há como pedir menos.
 *
 * ── `Codigo` E O PAR DE IBGE, JUNTOS ──────────────────────────────────────────────────────────
 *
 * O manual diz que os dois IBGE são obrigatórios, e que sem eles "todas as rotas do cliente serão
 * listadas SEM DETALHAMENTO" — que é justamente o modo em que o KML não vem. Mandar os três é o que
 * garante a rota certa com a geometria dentro.
 *
 * `CriarSeNaoExistir` fica de fora, e de propósito: ele CRIA rota no cadastro da gerenciadora. Uma
 * varredura de leitura que cria coisa do outro lado seria a pior surpresa possível.
 */
export async function getRotaComKML(
  cred: Credenciais,
  codigo: number,
  ibgeOrigem: number,
  ibgeDestino: number,
): Promise<RotaComKML | null> {
  const r = await chamar<{ Rotas?: RotaComKML[] }>("getRotas", {
    ...cred,
    Codigo: codigo,
    CodIBGECidadeOrigem: ibgeOrigem,
    CodIBGECidadeDestino: ibgeDestino,
    DevolverKML: "S",
    DetalharRota: "N",
  });
  return (r.Rotas ?? [])[0] ?? null;
}

/**
 * O RESULTADO DA PESQUISA — e este é de GRAÇA (31/08, fatia 028, etapa 7).
 *
 * `get*`, como `getCidades`, `getTabela` e `getPosicoes`: leitura não custa. É o que permite este
 * ser um job agendado, ao contrário do `setSolicitacaoPesquisaConsulta`, que só sai de um clique.
 *
 * ── PERGUNTA POR CPF E VÍNCULO, não pelo código ───────────────────────────────────────────────
 *
 * O manual (pág. 150) pede `Identificacao` + `Vinculo`, e não o `Codigo` que a solicitação
 * devolveu. Por isso o vínculo escolhido no pedido PRECISA ficar guardado: sem ele não há como
 * perguntar pelo resultado do que se pagou.
 *
 * ── O QUE ELE TRAZ ALÉM DO STATUS ─────────────────────────────────────────────────────────────
 *
 * `Justificativas` é a lista do que impediu a aprovação, com código e descrição por extenso — "favor
 * anexar no sistema a cópia atualizada do documento", "nº do RENAVAM incorreto". É a informação que
 * hoje só existe abrindo a tela deles, e é ela que diz o que fazer para destravar.
 */
export async function getResultadoPesquisaConsulta(
  cred: Credenciais,
  pedido: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return chamar<Record<string, unknown>>("getResultadoPesquisaConsulta", { ...cred, ...pedido });
}

// ---------------------------------------------------------------------------
// O que a gerenciadora JÁ SABE — as duas leituras que evitam gastar (2026-09-03)
// ---------------------------------------------------------------------------

/**
 * O MOTORISTA JÁ EXISTE NO CADASTRO DELA? — leitura, de graça.
 *
 * ⚠️ **O CPF VAI NA RAIZ, NÃO DENTRO DE `Motorista`** — e isso contraria a tabela do manual.
 *
 * A página 52 documenta a requisição como um registro `Motorista` com `CPF` dentro, igual ao
 * `setMotorista`. Mandando assim, a API responde `CodErro 105 — campo obrigatório: CPF`, que PARECE
 * "o motorista não existe" e é fácil de ler como resposta negativa. Medido em produção em 03/09: com
 * o CPF na raiz, o mesmo motorista volta com `CodErro 0` e o cadastro inteiro.
 *
 * É a mesma armadilha do `getTabela` (`NomeTabela`, não `Tabela`) e do `getCidades`
 * (`FiltroCidade`, não `Cidade`): errar o nome do parâmetro devolve 105 e mente sobre a existência
 * do recurso.
 *
 * `null` quando ela não conhece o CPF. Qualquer outro erro sobe como `IntegraRecusou`.
 */
export async function getMotorista(
  cred: Credenciais,
  cpf: string,
): Promise<Record<string, unknown> | null> {
  try {
    const r = await chamar<{ Motorista?: Record<string, unknown> }>("getMotorista", {
      ...cred,
      CPF: cpf,
    });
    const m = r.Motorista;
    // Registro vazio é "não conheço": ela devolve `{}` em vez de erro nesse caso.
    return m && Object.keys(m).length > 0 ? m : null;
  } catch (e) {
    if (e instanceof IntegraRecusou && e.codErro === COD_ERRO_SEM_CADASTRO) return null;
    throw e;
  }
}

/** "Não existe Pesquisa/Consulta com esses dados" — resposta legítima, não falha. */
const COD_ERRO_SEM_PESQUISA = 182;
/** O mesmo espírito para o cadastro: ausência não é erro. */
const COD_ERRO_SEM_CADASTRO = 181;

/** O que ela devolve sobre uma pesquisa que já existe. */
export interface PesquisaNaGerenciadora {
  codigo: number;
  /** `SP` sem pesquisa · `EP` em pesquisa · `AP` aguardando · `AD` adequado ao risco ·
   *  `NA` inconclusivo · `EX` expirado · `AC` a consultar · `B` análise biométrica. */
  situacao: string;
  /** `AAAA-MM-DD`. Depois dela a pesquisa não vale mais e refazer é o certo. */
  dataExpiracao: string | null;
  /** O que impediu a aprovação, quando há. */
  justificativas: { codigo: number; descricao: string }[];
  /**
   * PESQUISA OU CONSULTA — `P` ou `C` (2026-09-05).
   *
   * É o `PE` / `CO` que aparece no cartão da tela da gerenciadora, e a gente descartava. A falta
   * dele já custou uma conclusão errada: olhando dois cartões do mesmo CPF sem saber qual era qual,
   * dá para achar que a empresa pagou duas pesquisas quando a segunda era uma consulta sobre a
   * primeira.
   *
   * Nulo quando ela não manda — o campo é obrigatório no manual, mas confiar nisso e escrever
   * `"P"` por omissão inventaria dado.
   */
  tipo: "P" | "C" | null;
  /**
   * O PHOTOCHECK — o link que o condutor abre para validar por foto, e quando ele vence.
   *
   * A tela deles tem quatro filtros disso (sem, em andamento, finalizado, expirado) e nós não
   * tínhamos nada. Vem junto porque é a mesma resposta: não custa chamada nova.
   *
   * Nulo é o normal, não é falha — só as pesquisas que exigem photocheck trazem o link.
   */
  photocheckUrl: string | null;
  /** `AAAA-MM-DD`. Depois disso o link não abre mais e o condutor precisa de outro. */
  photocheckExpiracao: string | null;
}

/**
 * JÁ EXISTE PESQUISA PARA ESTE CPF E VÍNCULO? — leitura, de graça, e é o que impede a duplicata.
 *
 * ⚠️ **A GERENCIADORA NÃO BLOQUEIA PESQUISA REPETIDA** (informado pelo usuário em 03/09): mandar
 * duas vezes cria DUAS pesquisas, e cada uma é cobrada. O guarda tem de ser nosso.
 *
 * ── O VÍNCULO FAZ PARTE DA CHAVE, e é aqui que um guarda ingênuo falha ────────────────────────
 *
 * A consulta só encontra a pesquisa se o `Vinculo` bater. Medido em produção: a pesquisa do CPF
 * 08389766469 existe sob **A** (agregado); consultando como F ou T, a API responde `CodErro 182 —
 * não existe`. Um guarda que perguntasse só pelo vínculo escolhido na hora responderia "pode
 * mandar" no caso exato que se quer evitar — pedir como Frota para quem já tem como Agregado.
 *
 * Por isso quem chama varre os TRÊS.
 *
 * Envelopa o `getResultadoPesquisaConsulta` acima em vez de repetir a chamada: aquele é o que o job
 * de pesquisa já usa para ler o desfecho do que pagou, e duas portas para a mesma pergunta
 * divergiriam no primeiro ajuste. `null` = não existe pesquisa com esse vínculo.
 */
export async function pesquisaExistente(
  cred: Credenciais,
  entrada: { codFilial: number; cpf: string; vinculo: "F" | "A" | "T" },
): Promise<PesquisaNaGerenciadora | null> {
  try {
    const r = await getResultadoPesquisaConsulta(cred, {
      CodFilial: entrada.codFilial,
      TipoIdentificacao: "P",
      Identificacao: entrada.cpf,
      Vinculo: entrada.vinculo,
    });
    return {
      codigo: Number(r.Codigo ?? 0),
      situacao: String(r.Situacao ?? ""),
      dataExpiracao: (r.DataExpiracao as string | undefined) ?? null,
      justificativas: ((r.Justificativas as { Codigo?: number; Descricao?: string }[] | undefined) ?? []).map((j) => ({
        codigo: Number(j.Codigo ?? 0),
        descricao: String(j.Descricao ?? ""),
      })),
      // Só `P` e `C` existem no manual. Qualquer outra coisa vira nulo em vez de virar dado.
      tipo: r.Tipo === "P" || r.Tipo === "C" ? r.Tipo : null,
      photocheckUrl: (r.PhotocheckUrl as string | undefined)?.trim() || null,
      photocheckExpiracao: (r.PhotocheckExpiracao as string | undefined)?.trim() || null,
    };
  } catch (e) {
    if (e instanceof IntegraRecusou && e.codErro === COD_ERRO_SEM_PESQUISA) return null;
    throw e;
  }
}
