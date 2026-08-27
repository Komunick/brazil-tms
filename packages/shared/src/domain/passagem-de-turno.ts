/**
 * A PASSAGEM DE TURNO — o catálogo dos cinco setores (2026-08-26, a pedido).
 *
 * Este arquivo é a planilha "Diário de Passagem de Turno" transcrita em estrutura. Ele não foi
 * desenhado: foi LIDO do `.xlsx` exportado em 26/08, incluindo as listas suspensas, que não
 * aparecem na tela e só existem dentro do arquivo. O levantamento inteiro está em
 * `docs/PROPOSTA-PASSAGEM-DE-TURNO.md`.
 *
 * ── A UNIDADE É `(data, turno, setor)` ────────────────────────────────────────────────────────
 *
 * Na planilha, um dia é uma aba; dentro dela os dois turnos ficam lado a lado (T1 nas colunas B–H,
 * T2 nas L–R) e os cinco setores empilhados um sob o outro. Cinco setores × dois turnos = DEZ
 * BLOCOS POR DIA, cada um com seu assistente, seu supervisor, seu resumo e suas seções.
 *
 * Por isso o relatório do dia NÃO se cria: a chave já existe. Quem abre a página encontra o bloco
 * do seu setor pronto para escrever. O que se cria à mão na planilha — a aba do dia — é justamente
 * o motivo de só existirem oito dias lá.
 *
 * ── POR QUE O CATÁLOGO É DADO, E NÃO VINTE TABELAS ────────────────────────────────────────────
 *
 * São 20 seções entre os cinco setores, com colunas diferentes em quase todas. Uma tabela por
 * seção seriam 20 migrações para descrever a mesma coisa — "uma ocorrência que alguém anotou" —, e
 * cada seção nova pedida pela operação viraria migração. Aconteceu já: a bonificação do Monitoring
 * entrou em 27/08 sem tocar no banco, que é o retorno concreto desta decisão. A regra dos ≥3 de `docs/PRINCIPLES.md`
 * aponta para o outro lado: uma tabela de item com o conteúdo em `jsonb`, e a FORMA declarada aqui.
 *
 * O preço é conhecido e aceito: o banco não valida os campos de dentro do `jsonb`. Quem valida é
 * este catálogo, dos dois lados — a rota antes de gravar e a tela antes de desenhar.
 *
 * ── POR QUE AQUI, E NÃO NO PACOTE DO BANCO ────────────────────────────────────────────────────
 *
 * Mesma razão de `status-programacao.ts`: a TELA desenha o formulário a partir desta lista, e a
 * tela é código de navegador. Importar valor de `@brazil-tms/db` arrastaria o cliente de Postgres
 * para o bundle.
 *
 * E, pelo mesmo motivo daquele arquivo, NENHUMA CLASSE DE TAILWIND entra aqui — o Tailwind varre só
 * `./app`, `./components` e `./lib` de `apps/web`, e uma cor escrita neste pacote sai branca sobre
 * branco sem que build, typecheck ou teste acusem. O teste `sem-classes-de-tailwind.test.ts`
 * tranca isso.
 */

/** Os cinco setores da planilha. A lista é fechada — confirmado em 26/08. */
export const SETORES = ["PROGRAMACAO", "SPOT", "EMISSAO", "GR", "MONITORING"] as const;
export type Setor = (typeof SETORES)[number];

export const ROTULO_DO_SETOR: Record<Setor, string> = {
  PROGRAMACAO: "Programação",
  SPOT: "Spot",
  EMISSAO: "Emissão",
  GR: "GR",
  MONITORING: "Monitoring",
};

/**
 * Os dois turnos, com as horas que a planilha declara no cabeçalho.
 *
 * `T2` ATRAVESSA A MEIA-NOITE (19h → 7h), e é isso que torna "a que turno pertence agora" uma
 * pergunta com resposta não óbvia. Ver `turnoDe`.
 */
export const TURNOS = ["T1", "T2"] as const;
export type Turno = (typeof TURNOS)[number];

export interface DefinicaoDeTurno {
  rotulo: string;
  /** Hora local de início, em `America/Sao_Paulo`. */
  inicioHora: number;
  /** Hora local de fim. Menor que `inicioHora` significa que o turno cruza a meia-noite. */
  fimHora: number;
}

export const DEFINICAO_DO_TURNO: Record<Turno, DefinicaoDeTurno> = {
  T1: { rotulo: "T1 (7h às 19h) — Diurno", inicioHora: 7, fimHora: 19 },
  T2: { rotulo: "T2 (19h às 7h) — Noturno", inicioHora: 19, fimHora: 7 },
};

// ── Os campos ───────────────────────────────────────────────────────────────────────────────────

/**
 * O tipo do campo decide o controle na tela E a validação na rota.
 *
 * `texto_longo` existe por um motivo concreto: a OCORRÊNCIA é o campo que faz a planilha usar
 * cartão em vez de tabela. Uma ocorrência real do Monitoring de 25/08 tem 90 caracteres — numa
 * tabela isso destrói a linha, que foi o mesmo motivo de o comentário da LH virar popup na 029.
 */
export type TipoDeCampo = "texto" | "texto_longo" | "lista" | "data_hora" | "hora" | "moeda";

export interface Campo {
  chave: string;
  rotulo: string;
  tipo: TipoDeCampo;
  /** Só para `tipo: "lista"`. É a lista suspensa que a planilha já tem — não se inventa outra. */
  opcoes?: readonly string[];
}

/**
 * AS LISTAS SUSPENSAS SÃO A TAXONOMIA QUE A OPERAÇÃO JÁ USA.
 *
 * Elas estavam escondidas: não aparecem em screenshot nem no CSV, só dentro do `.xlsx` (nos nós
 * `dataValidation`). Copiadas literalmente, acentos e barras inclusive. Trocar `Quebra de Veículo`
 * por `QUEBRA_VEICULO` pareceria arrumação e quebraria a comparação com o histórico da planilha
 * no dia em que alguém quiser cruzar os dois.
 */
export const OCORRENCIA_SEM_ATRIBUICAO = ["Sem Confirmação", "Sem Atribuição"] as const;

export const OCORRENCIA_RASTREAMENTO = [
  "Checklist não realizado",
  "Sem rastreamento",
  "Sem SM / motorista acionado",
] as const;

export const ETA_DESTINO = ["EARLY", "ON TIME", "DELAY"] as const;

/**
 * O estado da bonificação. A planilha NÃO trava este campo e mesmo assim só tem estes dois.
 *
 * Vira lista aqui porque é ESTADO, não relato: em texto livre conviveriam "recebido", "Recebido" e
 * "RECEBIDO", e nenhuma contagem funcionaria depois. É a distinção oposta à da ocorrência do
 * Monitoring, que soltou justamente por ser relato — ver a nota lá.
 */
export const STATUS_DA_BONIFICACAO = ["Recebido", "Aguardando chave"] as const;

export const PERFIL_DE_VEICULO = ["CARRETA", "TRUCK"] as const;

// Os campos que se repetem entre seções. Declarados uma vez para que o rótulo não divirja.
const LH: Campo = { chave: "lh", rotulo: "LH", tipo: "texto" };
const ORIGEM: Campo = { chave: "origem", rotulo: "Origem", tipo: "texto" };
const DESTINO: Campo = { chave: "destino", rotulo: "Destino", tipo: "texto" };
const ETA_ORIGEM: Campo = { chave: "eta_origem", rotulo: "ETA origem", tipo: "data_hora" };
const MOTORISTA: Campo = { chave: "motorista", rotulo: "Motorista", tipo: "texto" };
const ROTA: Campo = { chave: "rota", rotulo: "Rota", tipo: "texto" };
const PLACA: Campo = { chave: "placa", rotulo: "Placa", tipo: "texto" };
const OCORRENCIA_LIVRE: Campo = {
  chave: "ocorrencia",
  rotulo: "Ocorrência",
  tipo: "texto_longo",
};

// ── As seções ───────────────────────────────────────────────────────────────────────────────────

/**
 * `tabela` × `cartao` é a única distinção de desenho que este catálogo carrega, e ela veio da
 * planilha: as seções de texto curto ficam em linhas, as de ocorrência longa ficam em blocos
 * verticais com a ocorrência ao lado.
 */
export type FormaDaSecao = "tabela" | "cartao";

export interface Secao {
  chave: string;
  titulo: string;
  forma: FormaDaSecao;
  campos: readonly Campo[];
}

/**
 * A NUMERAÇÃO DA PLANILHA NÃO VEM JUNTO, e isso é deliberado.
 *
 * Em PROGRAMAÇÃO as seções são numeradas `1, 3, 4, 4, 4, 5` — não há seção 2 e o 4 aparece três
 * vezes. É o rastro de uma planilha copiada e editada à mão. A ordem do array já diz a ordem; o
 * número seria uma segunda fonte da mesma informação, e ela já nasceu errada.
 */
export const SECOES_DO_SETOR: Record<Setor, readonly Secao[]> = {
  PROGRAMACAO: [
    {
      chave: "rotas_sem_atribuicao",
      titulo: "Rotas sem atribuição / confirmação",
      forma: "tabela",
      campos: [
        LH,
        ORIGEM,
        DESTINO,
        ETA_ORIGEM,
        {
          chave: "ocorrencia",
          rotulo: "Ocorrência",
          tipo: "lista",
          opcoes: OCORRENCIA_SEM_ATRIBUICAO,
        },
      ],
    },
    {
      chave: "ponto_de_atencao",
      titulo: "Ponto de atenção",
      forma: "cartao",
      campos: [LH, ORIGEM, DESTINO, ETA_ORIGEM, MOTORISTA, OCORRENCIA_LIVRE],
    },
    {
      chave: "rotas_canceladas",
      titulo: "Rotas canceladas",
      forma: "tabela",
      campos: [LH, ROTA, ETA_ORIGEM, MOTORISTA, OCORRENCIA_LIVRE],
    },
    {
      chave: "no_show",
      titulo: "No show",
      forma: "cartao",
      campos: [MOTORISTA, ROTA, OCORRENCIA_LIVRE],
    },
    {
      chave: "motorista_disponivel",
      titulo: "Motorista disponível",
      forma: "tabela",
      campos: [
        MOTORISTA,
        { chave: "perfil", rotulo: "Perfil", tipo: "lista", opcoes: PERFIL_DE_VEICULO },
        { chave: "telefone", rotulo: "Telefone", tipo: "texto" },
        { chave: "rota_regiao", rotulo: "Rota / região", tipo: "texto" },
      ],
    },
    {
      chave: "bloqueio_de_motorista",
      titulo: "Solicitação de bloqueio de motorista",
      forma: "cartao",
      campos: [MOTORISTA, ROTA, OCORRENCIA_LIVRE],
    },
  ],

  SPOT: [
    {
      chave: "spots_aceitos",
      titulo: "Spots aceitos",
      forma: "tabela",
      campos: [LH, ORIGEM, DESTINO, ETA_ORIGEM, MOTORISTA],
    },
    {
      chave: "spots_perdidos",
      titulo: "Spot perdido / aceito por outra 3PL",
      forma: "tabela",
      campos: [
        LH,
        ORIGEM,
        DESTINO,
        { chave: "data_criacao", rotulo: "Data de criação", tipo: "data_hora" },
        OCORRENCIA_LIVRE,
      ],
    },
    {
      chave: "tendencia_aceita",
      titulo: "Tendência aceita",
      forma: "tabela",
      campos: [LH, ORIGEM, DESTINO, ETA_ORIGEM, MOTORISTA],
    },
    {
      chave: "tendencia_perdida",
      titulo: "Tendência perdida / aceita por outra 3PL",
      forma: "tabela",
      campos: [
        LH,
        ORIGEM,
        DESTINO,
        { chave: "data_criacao", rotulo: "Data de criação", tipo: "data_hora" },
        OCORRENCIA_LIVRE,
      ],
    },
  ],

  EMISSAO: [
    {
      chave: "emissoes_nao_realizadas",
      titulo: "Emissões não realizadas",
      forma: "cartao",
      campos: [
        LH,
        ORIGEM,
        DESTINO,
        { chave: "perfil", rotulo: "Perfil", tipo: "lista", opcoes: PERFIL_DE_VEICULO },
        OCORRENCIA_LIVRE,
      ],
    },
    {
      chave: "acordo_de_frete",
      titulo: "Acordo de frete",
      forma: "cartao",
      campos: [
        LH,
        ORIGEM,
        DESTINO,
        { chave: "valor", rotulo: "Valor", tipo: "moeda" },
        { chave: "responsavel", rotulo: "Responsável", tipo: "texto" },
        OCORRENCIA_LIVRE,
      ],
    },
    {
      chave: "ocorrencias_proximo_turno",
      titulo: "Ocorrências para o próximo turno",
      forma: "cartao",
      campos: [LH, ORIGEM, DESTINO, MOTORISTA, OCORRENCIA_LIVRE],
    },
  ],

  GR: [
    {
      chave: "viagens_criticas",
      titulo: "Viagens em situação crítica",
      forma: "cartao",
      campos: [LH, ORIGEM, DESTINO, OCORRENCIA_LIVRE],
    },
    {
      chave: "pendencia_de_rastreamento",
      titulo: "Viagens com pendência de rastreamento",
      forma: "tabela",
      campos: [
        LH,
        PLACA,
        ORIGEM,
        DESTINO,
        { chave: "responsavel", rotulo: "Responsável", tipo: "texto" },
        {
          chave: "ocorrencia",
          rotulo: "Ocorrência",
          tipo: "lista",
          opcoes: OCORRENCIA_RASTREAMENTO,
        },
      ],
    },
    {
      chave: "pronta_resposta",
      titulo: "Pronta resposta — acionamentos",
      forma: "tabela",
      campos: [
        LH,
        PLACA,
        ORIGEM,
        DESTINO,
        { chave: "horario_acionamento", rotulo: "Horário do acionamento", tipo: "hora" },
        {
          chave: "ocorrencia",
          rotulo: "Ocorrência",
          tipo: "lista",
          opcoes: OCORRENCIA_RASTREAMENTO,
        },
      ],
    },
  ],

  MONITORING: [
    {
      chave: "viagens_criticas",
      titulo: "Viagens em situação crítica",
      forma: "cartao",
      campos: [
        LH,
        ORIGEM,
        DESTINO,
        MOTORISTA,
        /**
         * TEXTO LIVRE, e não a lista de quatro (2026-08-27, a pedido).
         *
         * A planilha trava este campo em `Quebra de Veículo`, `Sem contato com motorista`,
         * `Sinistro` e `Parada Excedida`. O Monitoring pediu para soltar, e tem razão: o conteúdo
         * REAL desta seção é prosa, não rótulo. O exemplo de 25/08 tem noventa caracteres —
         * *"Drive rodou boa parte da viagem em velocidade reduzida devido…"* — e nenhuma das quatro
         * opções diria isso.
         *
         * A trava produzia o pior dos dois mundos: obrigava a escolher um rótulo aproximado e
         * jogava fora o que de fato aconteceu.
         *
         * ── ONDE A LISTA CONTINUA, E POR QUÊ ────────────────────────────────────────────────────
         *
         * As listas do GR (rastreamento e pronta resposta) FICAM. Lá o campo é um MOTIVO de um
         * conjunto fechado — "checklist não realizado" é uma classificação, e classificação em texto
         * livre vira quatro grafias da mesma coisa e nenhum agrupamento funciona depois.
         *
         * A divisão é essa: estado e motivo pedem lista; relato pede liberdade.
         */
        OCORRENCIA_LIVRE,
      ],
    },
    {
      chave: "rotas_em_acompanhamento",
      titulo: "Rotas em acompanhamento",
      forma: "cartao",
      campos: [
        ROTA,
        { chave: "eta_destino", rotulo: "ETA destino", tipo: "lista", opcoes: ETA_DESTINO },
        MOTORISTA,
        OCORRENCIA_LIVRE,
      ],
    },
    {
      chave: "bloqueio_de_motorista",
      titulo: "Solicitação de bloqueio de motorista",
      forma: "cartao",
      campos: [MOTORISTA, ROTA, OCORRENCIA_LIVRE],
    },
    /**
     * A BONIFICAÇÃO — a seção que eu tinha perdido (2026-08-27, apontada pelo usuário).
     *
     * Ela existe na planilha, na linha 326, e escapou da primeira leitura por um motivo específico:
     * está **só no lado do T2** (coluna L). Eu tinha varrido o lado do T1 até o fim e assumido que
     * os dois turnos tinham as mesmas seções — o que vale para as outras dezenove e não vale para
     * esta.
     *
     * Ela entra para os DOIS turnos mesmo assim. Uma seção que só o noturno enxerga seria uma
     * armadilha: o diurno precisaria pedir ao noturno para registrar o que viu, e é exatamente esse
     * tipo de dependência que a passagem de turno existe para eliminar.
     *
     * ── O STATUS É LISTA, E A OCORRÊNCIA DA SEÇÃO ACIMA NÃO É ───────────────────────────────────
     *
     * A planilha não trava este campo, e mesmo assim só há dois valores nela: `Recebido` e
     * `Aguardando chave`. É um ESTADO de um processo com duas pontas, não um relato — e estado em
     * texto livre vira "recebido", "Recebido" e "RECEBIDO" convivendo, o que impede qualquer
     * contagem depois.
     *
     * Se um terceiro estado aparecer, é uma linha aqui.
     */
    {
      chave: "bonificacao",
      titulo: "Bonificação rota Simões x Jaboatão",
      forma: "tabela",
      campos: [
        MOTORISTA,
        { chave: "status", rotulo: "Status", tipo: "lista", opcoes: STATUS_DA_BONIFICACAO },
      ],
    },
  ],
};

// ── O resumo da operação ────────────────────────────────────────────────────────────────────────

/**
 * `calculado` × `digitado` é a razão de trazer isto para o TMS em vez de copiar a planilha.
 *
 * Metade destes números o banco já sabe responder. Hoje alguém conta à mão, de madrugada, e erra.
 * A outra metade acontece fora do sistema — CTe, adiantamento, bloqueio, pronta resposta — e
 * continua digitada, sem fingir que é derivada.
 *
 * O contador `calculado` continua ACEITANDO valor digitado: quem está no turno pode saber de algo
 * que o banco ainda não viu. Quando isso acontece a tela mostra OS DOIS — o digitado vale e o do
 * sistema aparece ao lado. Um resumo que discorda do banco em silêncio é pior que resumo nenhum.
 */
export type FonteDoContador = "calculado" | "digitado";

export interface Contador {
  chave: string;
  rotulo: string;
  fonte: FonteDoContador;
  /**
   * Só para os `digitado` que PODERIAM ser calculados — o que falta para promovê-los.
   *
   * ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────────────────────
   *
   * A primeira versão deste catálogo marcava quinze contadores como `calculado`, por otimismo. Ao
   * conferir coluna por coluna, só quatro tinham dado confiável atrás. Os outros onze teriam
   * mostrado ZERO com cara de número apurado — que é a pior saída possível num resumo de turno:
   * ninguém desconfia de um zero, e o erro só apareceria quando alguém agisse em cima dele.
   *
   * Marcá-los `digitado` é honesto e não perde nada — é o que a planilha já faz. Esta nota guarda
   * o caminho de volta para quando o dado existir, para que a decisão não precise ser redescoberta.
   */
  pendencia?: string;
}

/**
 * O RESUMO DEPENDE DO TURNO, e não só do setor. Isso não é generalidade preventiva: o GR da
 * planilha realmente difere entre os dois.
 *
 *   T1  SM sem realização antes de 2h   ·  Bloqueios
 *   T2  SM sem realização antes de 24h  ·  Desbloqueios
 *
 * `Bloqueios` × `Desbloqueios` parece deliberado — o noturno desbloqueia o que o diurno bloqueou.
 * O `2h` × `24h` parece engano de cópia, mas NÃO SE ADIVINHA: pergunta em aberto com o setor GR
 * (26/08). Até a resposta chegar os dois turnos guardam contadores próprios, que é o que a planilha
 * faz hoje. Se vier "era engano", some um dos dois e o outro continua com os mesmos dados.
 */
export function contadoresDo(setor: Setor, turno: Turno): readonly Contador[] {
  if (setor === "GR") {
    return [
      {
        chave: "sm_sem_realizacao",
        rotulo: turno === "T1" ? "SM sem realização antes de 2h" : "SM sem realização antes de 24h",
        fonte: "digitado",
      },
      {
        chave: "sem_espelhamento",
        rotulo: "Sem espelhamento",
        fonte: "digitado",
        pendencia:
          "Exige cruzar `logae_positions` com a viagem em curso. A gerenciadora monitora ~91 " +
          "veículos e o portal tem 936 placas: a ausência em `logae_positions` não distingue " +
          "'sem espelhamento' de 'fora da frota monitorada'.",
      },
      {
        chave: "veiculo_sem_sm",
        rotulo: "Veículo sem SM",
        fonte: "digitado",
        pendencia:
          "Depende de `trip_pre_sm` refletir a SM efetivada, que é a 027 — e efetivar " +
          "(`setEfetivaPreSM`) está fora do escopo dela.",
      },
      {
        chave: "cadastros_realizados",
        rotulo: "Cadastros realizados (motorista, cavalo, truck e carreta)",
        fonte: "digitado",
      },
      {
        chave: "cadastros_pendentes",
        rotulo: "Cadastros pendentes (motorista)",
        fonte: "digitado",
        pendencia:
          "`resource_status` tem active/inactive/unavailable/maintenance/blocked — não tem " +
          "'pendente' nem 'reprovado'. Contar `inactive` misturaria os dois: em 18/08, 70% do " +
          "cadastro nasceu inativo por importação, não por reprovação.",
      },
      {
        chave: "cadastros_reprovados",
        rotulo: "Cadastros reprovados (motorista)",
        fonte: "digitado",
        pendencia: "Mesma razão de `cadastros_pendentes`.",
      },
      {
        chave: turno === "T1" ? "bloqueios" : "desbloqueios",
        rotulo: turno === "T1" ? "Bloqueios" : "Desbloqueios",
        fonte: "digitado",
      },
      { chave: "pr_acionados", rotulo: "PR acionados", fonte: "digitado" },
    ];
  }
  return CONTADORES_FIXOS[setor];
}

/** Os quatro setores cujo resumo é o mesmo nos dois turnos. O GR é a exceção, em `contadoresDo`. */
const CONTADORES_FIXOS: Record<Exclude<Setor, "GR">, readonly Contador[]> = {
  PROGRAMACAO: [
    { chave: "no_show", rotulo: "No show", fonte: "calculado" },
    { chave: "pendente_confirmacao", rotulo: "Pendente de confirmação", fonte: "calculado" },
    { chave: "sem_atribuicao", rotulo: "Sem atribuição", fonte: "calculado" },
    {
      chave: "eta_origem_delay",
      rotulo: "ETA origem (delay)",
      fonte: "digitado",
      pendencia:
        "Precisa da chegada REAL na origem para comparar com a janela planejada. O marco existe " +
        "em `trip_events`, mas depende de o portal tê-lo publicado — e uma viagem sem o evento " +
        "seria contada como pontual, que é o erro mais caro possível neste contador.",
    },
    { chave: "cancelamento", rotulo: "Cancelamento", fonte: "calculado" },
  ],
  SPOT: [
    {
      chave: "spot_aceito",
      rotulo: "Spot aceito",
      fonte: "digitado",
      pendencia:
        "`spot_offers` guarda a oferta, não o desfecho — quem aceita vira viagem em `trips`, e o " +
        "vínculo entre as duas não é chave, é nome de estação. Ver a nota do filtro de spot.",
    },
    {
      chave: "spot_nao_aceito",
      rotulo: "Spot não aceito",
      fonte: "digitado",
      pendencia: "Mesma razão de `spot_aceito`.",
    },
    { chave: "spot_outra_3pl", rotulo: "Spot aceito por outra 3PL", fonte: "digitado" },
    { chave: "tendencia_aceita", rotulo: "Tendência aceita", fonte: "digitado" },
    { chave: "tendencia_nao_aceita", rotulo: "Tendência não aceita", fonte: "digitado" },
    { chave: "tendencia_outra_3pl", rotulo: "Tendência aceita por outra 3PL", fonte: "digitado" },
  ],
  EMISSAO: [
    { chave: "lh_sem_cte", rotulo: "LH sem CTe", fonte: "digitado" },
    { chave: "cte_nao_emitido", rotulo: "CTe não emitido", fonte: "digitado" },
    { chave: "cte_emitido", rotulo: "CTe emitido", fonte: "digitado" },
    { chave: "sem_adiantamento", rotulo: "Viagem sem adiantamento", fonte: "digitado" },
    { chave: "placas_divergentes", rotulo: "Placas divergentes", fonte: "digitado" },
  ],
  MONITORING: [
    { chave: "quebra_de_veiculo", rotulo: "Quebra de veículo", fonte: "digitado" },
    { chave: "retido_posto_fiscal", rotulo: "Retido no posto fiscal", fonte: "digitado" },
    /**
     * EARLY / DELAY / ON TIME dependem da chegada real no DESTINO, pela mesma razão que o
     * `eta_origem_delay` da Programação: sem o marco publicado, toda viagem viraria "on time".
     */
    { chave: "early", rotulo: "Early", fonte: "digitado", pendencia: "Ver `eta_origem_delay`." },
    { chave: "delay", rotulo: "Delay", fonte: "digitado", pendencia: "Ver `eta_origem_delay`." },
    {
      chave: "on_time",
      rotulo: "On time",
      fonte: "digitado",
      pendencia: "Ver `eta_origem_delay`.",
    },
    {
      chave: "sem_espelhamento",
      rotulo: "Veículo sem espelhamento",
      fonte: "digitado",
      pendencia: "Ver o `sem_espelhamento` do GR.",
    },
  ],
};

// ── Onde "agora" cai ────────────────────────────────────────────────────────────────────────────

/**
 * A que bloco `(data, turno)` pertence um instante — em hora de SÃO PAULO, nunca UTC.
 *
 * ── O DEFEITO QUE ISTO EVITA ──────────────────────────────────────────────────────────────────
 *
 * Às 19h de Brasília o T1 fecha. Em UTC isso é 22h — ainda o mesmo dia, e o engano passaria
 * despercebido. Mas às 22h de Brasília (01h UTC do dia seguinte) o T2 está no meio do expediente e
 * o cálculo em UTC já teria virado a data: o operador escreveria no bloco de amanhã, e amanhã
 * encontraria o bloco de ontem com metade do seu turno dentro.
 *
 * ── A DATA DO T2 É A DO DIA EM QUE ELE COMEÇOU ────────────────────────────────────────────────
 *
 * O T2 vai das 19h às 7h e atravessa a meia-noite. Às 02h de terça, quem está de plantão está no
 * turno que começou na SEGUNDA — e é no bloco de segunda que ele escreve, como na planilha, onde a
 * aba de segunda carrega o noturno inteiro. Sem isto, a madrugada de todo turno noturno se perderia
 * numa aba diferente da noite que a precedeu.
 */
export function turnoDe(instante: Date): { data: string; turno: Turno } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);

  const parte = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const data = `${parte("year")}-${parte("month")}-${parte("day")}`;
  const hora = Number(parte("hour"));

  if (hora >= DEFINICAO_DO_TURNO.T1.inicioHora && hora < DEFINICAO_DO_TURNO.T1.fimHora) {
    return { data, turno: "T1" };
  }
  // Antes das 7h ainda é o noturno que começou ONTEM.
  if (hora < DEFINICAO_DO_TURNO.T2.fimHora) {
    return { data: diaAnterior(data), turno: "T2" };
  }
  return { data, turno: "T2" };
}

/** Recua um dia numa data `AAAA-MM-DD`, sem depender de fuso — a string já é local. */
function diaAnterior(data: string): string {
  const [a = 0, m = 1, d = 1] = data.split("-").map(Number);
  // `Date.UTC` aqui é aritmética de calendário sobre uma data já resolvida em São Paulo, não
  // conversão de fuso: entra e sai a mesma parede de relógio.
  const t = new Date(Date.UTC(a, m - 1, d) - 86_400_000);
  return t.toISOString().slice(0, 10);
}

// ── Validação do conteúdo do item ───────────────────────────────────────────────────────────────

/**
 * O `jsonb` do item conferido contra a seção que o declarou.
 *
 * O banco não pode fazer isto — é o preço de ter uma tabela de item em vez de vinte. Então
 * quem faz é esta função, e ela roda dos DOIS lados: na rota antes de gravar, e na tela antes de
 * habilitar o botão. Devolve TODOS os problemas, não o primeiro: quem preencheu um cartão de seis
 * campos merece saber os três que faltam de uma vez.
 */
export function problemasDoItem(
  setor: Setor,
  secaoChave: string,
  dados: Record<string, unknown>,
): string[] {
  const secao = SECOES_DO_SETOR[setor]?.find((s) => s.chave === secaoChave);
  if (!secao) return [`Seção desconhecida em ${ROTULO_DO_SETOR[setor]}: ${secaoChave}`];

  const problemas: string[] = [];
  const conhecidos = new Set(secao.campos.map((c) => c.chave));

  for (const chave of Object.keys(dados)) {
    if (!conhecidos.has(chave)) problemas.push(`Campo desconhecido: ${chave}`);
  }

  for (const campo of secao.campos) {
    const valor = dados[campo.chave];
    if (valor === undefined || valor === null || valor === "") continue;
    if (typeof valor !== "string") {
      problemas.push(`${campo.rotulo}: precisa ser texto`);
      continue;
    }
    if (campo.tipo === "lista" && campo.opcoes && !campo.opcoes.includes(valor)) {
      problemas.push(`${campo.rotulo}: "${valor}" não está na lista`);
    }
  }

  // Um item sem nada dentro não é um item. A tela não deveria enviá-lo, mas quem grava é a rota.
  const algumPreenchido = secao.campos.some((c) => {
    const v = dados[c.chave];
    return typeof v === "string" && v.trim() !== "";
  });
  if (!algumPreenchido) problemas.push("O item está vazio");

  return problemas;
}

// ── Quem pode editar ────────────────────────────────────────────────────────────────────────────

/**
 * QUEM EDITA A FAIXA DE UM SETOR.
 *
 * "Só a pessoa daquele setor vai poder editar" — a regra é do usuário, e é curta de propósito.
 * Todo mundo LÊ tudo: a passagem de turno existe para ser lida por quem entra, e um diário que só o
 * autor enxerga não passa nada a ninguém.
 *
 * ── POR QUE `admin` PASSA ─────────────────────────────────────────────────────────────────────
 *
 * Não por hierarquia — por manutenção. Alguém precisa poder corrigir um bloco quando a pessoa do
 * setor saiu de férias com o turno pela metade, e sem isso a saída seria trocar o setor da conta de
 * alguém temporariamente, que é pior: silencioso, e fácil de esquecer desfeito.
 *
 * ── E POR QUE NENHUM OUTRO PAPEL PASSA ────────────────────────────────────────────────────────
 *
 * A tentação seria deixar `operations_manager` editar tudo, já que ele é chefe. Mas o valor deste
 * diário está em ser a palavra de QUEM ESTAVA no turno. Um gerente que corrige o relato do
 * assistente produz um registro que parece do assistente e não é — e é justamente esse registro que
 * alguém vai ler de madrugada para decidir o que fazer.
 *
 * ── SETOR NULO NÃO É "PODE TUDO" ──────────────────────────────────────────────────────────────
 *
 * É o caso da maioria das contas, e o padrão precisa ser o seguro. Nulo lê e não escreve.
 */
export function podeEditarOSetor(args: {
  ehAdmin: boolean;
  setorDoUsuario: Setor | null | undefined;
  setorAlvo: Setor;
}): boolean {
  if (args.ehAdmin) return true;
  return args.setorDoUsuario === args.setorAlvo;
}

/** `setor` vindo de fora (banco, querystring) conferido contra a lista. Nulo para o que não bate. */
export function setorValido(valor: unknown): Setor | null {
  return typeof valor === "string" && (SETORES as readonly string[]).includes(valor)
    ? (valor as Setor)
    : null;
}

/** O mesmo para o turno. */
export function turnoValido(valor: unknown): Turno | null {
  return typeof valor === "string" && (TURNOS as readonly string[]).includes(valor)
    ? (valor as Turno)
    : null;
}
