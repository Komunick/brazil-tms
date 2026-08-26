/**
 * O QUE MUDOU NO TMS — a lista, escrita à mão (2026-08-25, a pedido).
 *
 * ── POR QUE NÃO É GERADO DO GIT ───────────────────────────────────────────────────────────────
 *
 * Seria mais barato ler os commits e montar a página sozinha. Seria também inútil: commit é escrito
 * para quem programa. "fix(spot): o ciclo só avisa das rotas nossas" não diz a ninguém da operação o
 * que mudou no dia dela, e a lista viraria ruído que ninguém abre duas vezes.
 *
 * Cada entrada aqui responde a uma pergunta só: **o que isso muda para quem usa?** O que não muda
 * nada visível — refatoração, teste, ajuste de CI — não entra. Uma lista honesta e curta é lida; uma
 * lista completa e indiferente, não.
 *
 * ── A ORDEM É A DO ARQUIVO ────────────────────────────────────────────────────────────────────
 *
 * Mais recente em cima, e a página não reordena nada. Ordenar por `data` faria duas mudanças do
 * mesmo dia trocarem de lugar sozinhas a cada carga, e a de cima é a que importa mais — quem escreve
 * decide isso, não o `sort`.
 *
 * ── COMO ACRESCENTAR ──────────────────────────────────────────────────────────────────────────
 *
 * Uma entrada nova vai no TOPO, com a data em que entrou em PRODUÇÃO (não a do commit, nem a do
 * merge no `dev` — o que vale é o dia em que a pessoa passou a ver aquilo na tela).
 */

/** Novidade é coisa que não existia; correção é coisa que existia e estava errada. */
export type TipoDeNovidade = "novidade" | "correcao";

export interface Novidade {
  /** `YYYY-MM-DD` — o dia em que entrou em produção. É por ela que o "Novo" é decidido. */
  data: string;
  titulo: string;
  /** O que mudou, do ponto de vista de quem usa. Uma ou duas frases. */
  descricao: string;
  /** Onde ver, quando a mudança tem endereço na tela. */
  onde?: string;
  tipo: TipoDeNovidade;
}

export const NOVIDADES: readonly Novidade[] = [
  {
    data: "2026-08-26",
    tipo: "novidade",
    titulo: "Veículos por perto, na hora de atribuir",
    descricao:
      "O formulário de atribuição passa a mostrar quais caminhões monitorados estão na cidade da coleta agora, com o motorista e há quantos minutos foi a última posição. Um clique preenche a placa. Abaixo, o mapa com a frota inteira — às vezes o bom está na cidade vizinha.",
    onde: "Expedição e Minha Programação · atribuir",
  },
  {
    data: "2026-08-26",
    tipo: "novidade",
    titulo: "O status muda na hora",
    descricao:
      "Marcar um status era esperar o quadro inteiro recarregar para o selo mudar. Agora ele muda no clique. E o que a colega marcar aparece em dez segundos, sem recarregar a página.",
    onde: "Minha Programação",
  },
  {
    data: "2026-08-26",
    tipo: "novidade",
    titulo: "A placa vem de lista, como o motorista",
    descricao:
      "No formulário de atribuição a placa era campo de digitar, ao lado de um motorista que vinha de lista. Agora ela também sugere — as placas que o portal já usou, buscáveis ignorando hífen. Um caminhão novo continua podendo ser digitado.",
    onde: "Expedição e Minha Programação · atribuir",
  },
  {
    data: "2026-08-26",
    tipo: "novidade",
    titulo: "O comentário abre no próprio marcador",
    descricao:
      "Antes era preciso abrir a viagem e rolar até o fim para ler um recado. Agora o marcador da linha abre só a conversa, com o campo de escrever. Ele aparece em todas as linhas, apagado quando não há comentário.",
    onde: "Minha Programação",
  },
  {
    data: "2026-08-26",
    tipo: "novidade",
    titulo: "Status na linha: a enviar, enviado, prog OK, no show",
    descricao:
      "A coluna STATUS da planilha, com as mesmas quatro marcas e as mesmas cores. Fica ao lado da paleta, abre numa caixinha e não estica a linha. É de todos — ao contrário da cor, que continua sendo sua.",
    onde: "Minha Programação",
  },
  {
    data: "2026-08-26",
    tipo: "novidade",
    titulo: "Comentar numa LH",
    descricao:
      "Dentro da viagem dá para deixar um recado — o que o cliente pediu, o que o motorista avisou. Fica visível para todos, e a linha da programação passa a mostrar quantos comentários a LH tem.",
    onde: "Minha Programação · janela da viagem",
  },
  {
    data: "2026-08-26",
    tipo: "novidade",
    titulo: "Previsto: quem vai dirigir, antes de atribuir",
    descricao:
      "Dá para deixar salvo o motorista e a placa que você pretende escalar, sem mandar nada ao portal. Aparece na coluna de motorista em cinza, com o selo Previsto, e some sozinho assim que a atribuição de verdade chega.",
    onde: "Minha Programação · janela da viagem",
  },
  {
    data: "2026-08-26",
    tipo: "novidade",
    titulo: "Duas frentes ao mesmo tempo",
    descricao:
      "O filtro por frente aceitava uma só. Agora dá para escolher duas — e como são três, isso é ver tudo menos a que não interessa hoje.",
    onde: "Minha Programação",
  },
  {
    data: "2026-08-26",
    tipo: "novidade",
    titulo: "A aba GR: a Pré-SM sem sair do TMS",
    descricao:
      "As viagens atribuídas aparecem numa fila com o que será enviado à gerenciadora — placas, motorista e horário. Quando falta alguma coisa, a própria linha diz o quê e onde resolver. Envio de uma por vez, e a viagem continua visível depois, com o número da Pré-SM e o botão de cancelar.",
    onde: "GR — Pré-SM, no menu de Operação",
  },
  {
    data: "2026-08-26",
    tipo: "novidade",
    titulo: "Bloquear um motorista",
    descricao:
      "No cadastro do motorista dá para bloqueá-lo, com o motivo escrito. Bloqueado, ele não é escalado em viagem nenhuma — nem pelo diálogo do portal. A lista de bloqueados tem aba própria.",
    onde: "Motoristas → abrir o cadastro",
  },
  {
    data: "2026-08-25",
    tipo: "correcao",
    titulo: "Atribuir pela Minha Programação chega no portal",
    descricao:
      "A janela da viagem abria a escala interna do TMS, que grava aqui e não pede nada ao portal — quem substituía a atribuição ia conferir lá e não achava nada. Agora ela abre o mesmo formulário da Expedição, que manda a ordem para o portal de verdade. O ranking da rota e o histórico do motorista continuam ao lado.",
    onde: "Minha Programação · janela da viagem",
  },
  {
    data: "2026-08-25",
    tipo: "correcao",
    titulo: "Ensaiar o aviso de spot também nos dias sem oferta",
    descricao:
      "O cartão de ofertas só abria quando já havia oferta registrada no dia — e os botões de teste moram dentro dele. Numa manhã sem oferta nenhuma, que é justamente quando se quer conferir se o aviso funciona, não havia como chegar neles. Agora o cartão abre sempre.",
    onde: "Início · cartão Ofertas de spot",
  },
  {
    data: "2026-08-24",
    tipo: "novidade",
    titulo: "Ensaiar aviso",
    descricao:
      "Um botão que mostra como é o aviso de oferta: o cartão sobe no meio da tela, toca o som e dispara a notificação do sistema. Serve para descobrir que o som está mudo hoje, e não no dia em que uma oferta boa passar. Não grava oferta nenhuma.",
    onde: "Início · cartão Ofertas de spot",
  },
  {
    data: "2026-08-24",
    tipo: "novidade",
    titulo: "A oferta de spot chega em 5 segundos",
    descricao:
      "O robô passou a olhar o portal de 5 em 5 segundos, em vez de 30 em 30, e o aviso do Telegram passou a sair do próprio TMS. Como o leilão tem prazo curto, esses segundos são a diferença entre dar lance e ler sobre a oferta depois.",
  },
  {
    data: "2026-08-24",
    tipo: "correcao",
    titulo: "O spot avisa só das rotas nossas",
    descricao:
      "O aviso saía para qualquer oferta em leilão no portal, inclusive de rota que não rodamos. Agora ele confere a rota antes — e o casamento ignora acento, o que está entre parênteses e a colagem de sigla com número, porque o portal escreve a mesma estação de várias formas.",
  },
  {
    data: "2026-08-24",
    tipo: "novidade",
    titulo: "Testar o aviso do Telegram",
    descricao:
      "Um botão que manda uma mensagem de teste pelo mesmo caminho da oferta real. A resposta distingue três casos — enviado, não configurado e falhou — porque cada um leva a um lugar diferente.",
    onde: "Status do Sistema",
  },
  {
    data: "2026-08-24",
    tipo: "novidade",
    titulo: "Minha Programação: o quadro que substitui a planilha",
    descricao:
      "As LHs dos próximos dias e dos anteriores num quadro só, com atribuição e edição no lugar, marcação em cor à sua escolha, filtro por dias e por status, e a viagem abrindo em janela ao clicar. É o que a planilha do Google fazia, dentro do sistema que já tem o dado.",
    onde: "Minha Programação",
  },
  {
    data: "2026-08-24",
    tipo: "novidade",
    titulo: "Histórico do motorista",
    descricao:
      "Ao lado do nome, no ranking, um botão que abre o que aquele motorista já rodou e as ocorrências registradas — reclamação, atraso, elogio e advertência.",
    onde: "Minha Programação · janela da viagem",
  },
  {
    data: "2026-08-24",
    tipo: "novidade",
    titulo: "Toda gravação avisa no canto se deu certo",
    descricao:
      "Antes era preciso adivinhar se o que você salvou foi gravado. Agora aparece um aviso no canto inferior direito, com um V verde quando deu certo e o motivo quando não deu.",
  },
  {
    data: "2026-08-24",
    tipo: "correcao",
    titulo: "Editar atribuição só enquanto ainda dá para trocar quem dirige",
    descricao:
      "O botão de editar aparecia em LH já em trânsito ou concluída, onde a troca não faz sentido. Agora ele só existe em Para atribuir e Atribuída.",
    onde: "Minha Programação",
  },
  {
    data: "2026-08-24",
    tipo: "correcao",
    titulo: "A linha do tempo deixou de editar status",
    descricao:
      "Dava para mudar o status pela linha do tempo do TMS. Não deveria: quem sabe o que aconteceu com a viagem é o portal, e uma edição aqui criava uma segunda verdade sobre o mesmo fato.",
    onde: "Viagem · linha do tempo",
  },
  {
    data: "2026-08-24",
    tipo: "novidade",
    titulo: "O telefone do motorista vem do rastreador",
    descricao:
      "O portal não entrega o telefone de todo motorista. O rastreador entrega, e agora o cadastro se completa sozinho com o que ele sabe.",
    onde: "Motoristas",
  },
  {
    data: "2026-08-23",
    tipo: "novidade",
    titulo: "O cadastro de motoristas do portal entra no TMS",
    descricao:
      "Os motoristas do portal passam a existir aqui, e o motorista novo entra sozinho quando aparece numa viagem — sem cadastro à mão.",
    onde: "Motoristas",
  },
  {
    data: "2026-08-23",
    tipo: "novidade",
    titulo: "Quem entrega no prazo, no geral e em cada rota",
    descricao:
      "Um ranking de pontualidade, com uma vista própria por rota. A nota leva o volume em conta, para duas entregas a 100% não passarem na frente de vinte a 93%.",
    onde: "Relatórios",
  },
  {
    data: "2026-08-23",
    tipo: "novidade",
    titulo: "Quem já foi bem nesta rota, na hora de atribuir",
    descricao:
      "Ao escolher o motorista, aparece ao lado quem já entregou bem naquela rota — a informação no momento da decisão, e não num relatório que ninguém abre com a viagem na mão.",
    onde: "Expedição",
  },
  {
    data: "2026-08-23",
    tipo: "novidade",
    titulo: "O menu ganhou grupos",
    descricao:
      "Vinte e três itens sem hierarquia viraram seis grupos, e sete ícones foram trocados — o mesmo caminhão marcava a Torre de Controle e o cadastro de Veículos, o que com o menu recolhido deixava as duas iguais.",
  },
  {
    data: "2026-08-23",
    tipo: "correcao",
    titulo: "A última posição lia o campo errado",
    descricao:
      "A posição do veículo vinha do campo do localizador, não do veículo. Onde os dois diferiam, a posição mostrada era de outro lugar.",
    onde: "Frota",
  },
];
