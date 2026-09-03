import { DateTime } from "luxon";
import { APP_TIME_ZONE } from "../formatting";

/**
 * QUEM ESTÁ LIVRE PARA RECEBER CARGA — a regra da aba "Motoristas disponíveis" (fatia 031, 03/09).
 *
 * ── ISTO NÃO É UM ESTADO GUARDADO ─────────────────────────────────────────────────────────────
 *
 * Nenhuma coluna nossa guarda "disponível". A resposta é tirada a cada leitura, do estado que o
 * portal do cliente já nos manda. Guardar a nossa versão seria criar uma segunda verdade que
 * diverge da primeira em silêncio — o erro que a fatia 030 documentou, e o silêncio é o problema.
 *
 * ── O QUE MORA AQUI, E O QUE MORA NO SQL ──────────────────────────────────────────────────────
 *
 * A fronteira é "precisa do banco?". Achar QUAL é a última viagem de cada motorista entre 4.000
 * viagens é pergunta de conjunto e fica no SQL. Decidir o que aquela viagem SIGNIFICA — o rótulo, e
 * se a linha ainda cabe na aba — é regra, muda, e fica aqui.
 *
 * O motivo prático é o fuso: a virada do dia em São Paulo é exatamente o que um teste de unidade
 * pega e um teste de integração não. Provar isso em SQL exigiria subir Postgres com dados dos dois
 * lados da meia-noite, em duas datas, todas as vezes.
 */

/** O que a coluna de situação diz. Três palavras, porque são três decisões diferentes. */
export type SituacaoDoMotorista = "finalizado" | "cancelada" | "a_caminho";

/**
 * DEPOIS DE QUANTOS DIAS PARADO O MOTORISTA SAI DA ABA.
 *
 * ── Por que existe um corte ───────────────────────────────────────────────────────────────────
 *
 * Sem ele a lista deixa de responder "quem está livre agora" e passa a responder "quem existe".
 * Medido na produção em 03/09: **117 motoristas** estão parados há mais de 7 dias e **72** há mais
 * de 30. Nenhum deles é resposta útil para quem precisa escalar uma carga hoje.
 *
 * ── Por que ele NÃO é sete por acaso ──────────────────────────────────────────────────────────
 *
 * A regra do usuário é "o motorista sai quando entrar em viagem". O corte não a contradiz: ele é um
 * filtro de RUÍDO, não uma regra de negócio. Quem terminou ontem e está livre continua na lista —
 * eram 20 motoristas no dia da decisão, e a alternativa (janela estrita de dois dias) os perderia.
 *
 * Mudar este número muda o TAMANHO da lista e mais nada.
 */
export const DIAS_ATE_SAIR_DA_ABA = 7;

/**
 * O QUE A VIAGEM SIGNIFICA para quem procura motorista livre.
 *
 * ── CANCELADA NÃO É FINALIZADA, e esta é a linha que não pode ser cruzada ─────────────────────
 *
 * As duas deixam o motorista livre, e por isso é tentador juntá-las num rótulo só. Mas FINALIZADO
 * quer dizer, para quem lê, que a carga CHEGOU. Escrevê-lo sobre uma viagem cancelada é a tela
 * afirmando uma entrega que não houve — e é o tipo de afirmação que só é descoberta quando alguém
 * cobra o frete. Eram 19 das 215 linhas no dia em que a regra foi escrita.
 */
export function situacaoDaViagem(status: string): SituacaoDoMotorista {
  if (status === "completed") return "finalizado";
  if (status === "cancelled") return "cancelada";
  return "a_caminho";
}

/** Motorista livre é quem terminou — de um jeito ou de outro. */
export function estaLivre(situacao: SituacaoDoMotorista): boolean {
  return situacao !== "a_caminho";
}

/**
 * ESTA LINHA AINDA CABE NA ABA?
 *
 * ── AS DUAS PORTAS SÃO DIFERENTES, e é isso que resolve a contradição do pedido ───────────────
 *
 * O pedido original tinha duas regras que, ao pé da letra, se contradiziam: "identificar quem chega
 * hoje ou amanhã" esconderia quem chegou ONTEM e está livre; "o motorista sai quando entrar em
 * viagem" o manteria. Eram 20 motoristas.
 *
 * A decisão do usuário (03/09) foi separar as duas portas:
 *
 *   · quem AINDA RODA entra pela janela — chega hoje ou amanhã, e some quando essa data passar;
 *   · quem JÁ TERMINOU fica, e só sai por viagem nova ou pelo corte de ruído.
 *
 * É por isso que esta função não tem uma condição só. Uma condição só teria de escolher entre as
 * duas regras, e escolher qualquer uma delas quebra metade do pedido.
 *
 * ── O SAIR POR VIAGEM NOVA NÃO ESTÁ AQUI, E É DE PROPÓSITO ────────────────────────────────────
 *
 * Não existe "remover da lista". Quando o motorista recebe carga nova, essa viagem passa a ser a
 * última dele (a de conclusão mais distante), chega depois de amanhã, e cai fora pela primeira
 * condição — sozinha. Um gesto de remoção seria um segundo caminho para o mesmo efeito, e os dois
 * discordariam no dia em que a viagem nova fosse cancelada.
 */
export function cabeNaAba(entrada: {
  situacao: SituacaoDoMotorista;
  /** A conclusão planejada da última viagem, em UTC. */
  conclusao: Date;
  agora: Date;
}): boolean {
  const { situacao, conclusao, agora } = entrada;

  if (estaLivre(situacao)) {
    /*
      O CORTE É EM DIAS CORRIDOS, não em dias de calendário.

      Sete dias de calendário fariam a lista encolher na virada da meia-noite, tirando de uma vez
      todo mundo que terminou naquele dia da semana. Em horas, cada motorista sai no seu horário.
    */
    const limite = new Date(agora.getTime() - DIAS_ATE_SAIR_DA_ABA * 24 * 60 * 60 * 1000);
    return conclusao.getTime() >= limite.getTime();
  }

  /*
    HOJE OU AMANHÃ **EM SÃO PAULO** — nunca em UTC.

    Uma conclusão às 23h30 de hoje em São Paulo é 02h30 de AMANHÃ em UTC. Contar em UTC faria a
    lista trocar de conteúdo às 21h, no meio do turno da noite, e passaria despercebido em qualquer
    teste feito de manhã. É o erro clássico deste projeto, e está tratado aqui de uma vez só.
  */
  const dia = DateTime.fromJSDate(conclusao).setZone(APP_TIME_ZONE).startOf("day");
  const hoje = DateTime.fromJSDate(agora).setZone(APP_TIME_ZONE).startOf("day");
  const distancia = dia.diff(hoje, "days").days;
  return distancia === 0 || distancia === 1;
}
