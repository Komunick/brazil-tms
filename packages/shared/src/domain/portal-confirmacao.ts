/**
 * A CONFIRMAÇÃO DA AÇÃO NO PORTAL (2026-08-28, a pedido).
 *
 * `retcode: 0` é o portal dizendo "recebi a chamada". Não é o portal dizendo "mudei de estado". São
 * coisas diferentes, e o TMS tratava como se fossem a mesma: a ordem virava `done` na palavra da
 * resposta imediata, o popup fechava dizendo que deu certo, e ninguém tinha como saber se a viagem
 * de fato mudou lá.
 *
 * Em 28/08 isso custou uma tarde: a operação achou que aceites não estavam chegando ao portal.
 * Estavam — mas a única forma de provar foi abrir o banco com SQL.
 *
 * Aqui está a segunda pergunta, feita ao portal DEPOIS da ação: "e aí, mudou?". O robô relê a
 * viagem pelo `/trip/detail` e manda o que voltou; esta função decide se aquilo é a ação que
 * pedimos.
 *
 * ── POR QUE UMA FUNÇÃO PURA, E AQUI ────────────────────────────────────────────────────────────
 *
 * Porque é regra de negócio e precisa de teste sem banco, sem rede e sem portal. Ela recebe o que
 * FOI ENVIADO e o que o portal DEVOLVEU, e devolve um veredito com motivo. Quem chama grava.
 *
 * ── O QUE ELA NÃO CONSEGUE VER ─────────────────────────────────────────────────────────────────
 *
 * O portal devolve UMA placa em `vehicle_number`. Quando a atribuição manda cavalo e carreta, só a
 * primeira é conferível — a segunda não tem contra o que ser comparada. Isso está declarado no
 * veredito (`placasConferidas`) em vez de ser silenciado: confirmar o que não se olhou seria pior
 * do que não confirmar.
 */

/** O que o portal devolveu sobre a viagem, já traduzido pelo mapeador da importação. */
export type ViagemNoPortal = {
  /** "Pending" | "Accepted" | ... — vem de `acceptance_status`. */
  acceptanceStatus: string | null;
  /** "Assigning" | "Assigned" | ... — vem de `trip_status`. */
  status: string | null;
  /** `vehicle_number` — a placa que o portal mostra. */
  plateLabel: string | null;
  /** `driver_name` — o motorista que o portal mostra. */
  driverLabel: string | null;
};

export type AcaoConfirmavel = "accept" | "reject" | "assign";

/**
 * TRÊS respostas, e a terceira não é detalhe (2026-08-28).
 *
 * `true` — o portal mostra o que pedimos.
 * `false` — o portal respondeu OK e a releitura DESMENTIU. Isto é falha, e trava o que vier depois.
 * `null` — não há como confirmar esta ação. Não é falha: é ausência de prova.
 *
 * Juntar `null` com `false` seria o defeito: a recusa não tem estado positivo para conferir, e
 * tratá-la como desmentida gravaria como FALHA toda recusa bem-sucedida — além de barrar o que
 * depende do desfecho. "Não sei" e "não foi" não podem ser a mesma resposta num caminho que
 * decide gasto.
 */
export type Veredito =
  | {
      confirmado: true;
      detalhe: string;
      placasConferidas: number;
      /**
       * Quantos motoristas deu para conferir. O portal mostra UM nome em `driver_name`, então numa
       * atribuição de dois este número é 1 — e dizê-lo é o ponto: confirmar o que não se olhou é o
       * que produziu o defeito que este campo nasceu para não repetir.
       */
      motoristasConferidos: number;
    }
  | { confirmado: false; motivo: string }
  | { confirmado: null; motivo: string };

import { nomeEntre } from "./nome-dobrado";

/** Placa comparável: só letras e números, maiúsculas. `ABC-1D23` e `abc1d23` são a mesma. */
function normalizar(placa: string): string {
  return placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * A ação pedida aconteceu no portal?
 *
 * `enviadas` são as placas que saíram daqui, na ordem em que foram mandadas — a primeira é a que o
 * portal mostra em `vehicle_number`.
 */
export function confirmarAcaoNoPortal(entrada: {
  acao: AcaoConfirmavel;
  enviadas: string[];
  /**
   * OS NOMES dos motoristas que foram escalados, como o NOSSO cadastro os escreve.
   *
   * Nomes e não ids porque é o que o portal devolve: `/trip/detail` traz `driver_name` e nenhum id.
   * Vazio quando não foi possível resolver o nome — e aí a conferência do motorista simplesmente não
   * acontece, em vez de reprovar por falta de dado nosso.
   */
  motoristasEnviados?: string[];
  portal: ViagemNoPortal;
}): Veredito {
  const { acao, portal } = entrada;

  if (acao === "accept") {
    if (portal.acceptanceStatus === "Accepted") {
      return {
        confirmado: true,
        detalhe: "o portal mostra a viagem como aceita",
        placasConferidas: 0,
        motoristasConferidos: 0,
      };
    }
    return {
      confirmado: false,
      motivo: `o portal respondeu OK mas a aceitação continua "${portal.acceptanceStatus ?? "sem valor"}"`,
    };
  }

  if (acao === "reject") {
    /**
     * Recusar não tem estado positivo para conferir: a viagem some da nossa lista, e o portal não
     * expõe "Rejected" em `acceptance_status`. Confirmar por ausência seria adivinhar.
     *
     * `null` e NÃO `false` — a diferença é a que importa aqui. `false` significa "o portal
     * desmentiu" e reprova a ordem; devolvê-lo aqui gravaria como FALHA toda recusa que deu certo,
     * porque o robô manda a releitura para qualquer ação bem-sucedida. Isto é ausência de prova,
     * não prova de ausência.
     */
    return {
      confirmado: null,
      motivo: "recusa não tem confirmação: o portal não expõe esse estado",
    };
  }

  // ── assign ──────────────────────────────────────────────────────────────────────────────────
  //
  // Duas perguntas, e as duas precisam responder sim. O status sozinho não basta: uma viagem pode
  // estar "Assigned" com a placa de OUTRA atribuição — foi exatamente o caso medido em 19/08, com
  // o cliente trocando o caminhão depois do nosso espelho.
  /**
   * A ACEITAÇÃO SÓ REPROVA QUANDO ELA EXISTE E DIZ OUTRA COISA (2026-08-29, terceira vez).
   *
   * O `/trip/detail` traz `vehicle_number` e NÃO traz `acceptance_status` — medido em produção. A
   * versão anterior exigia "Accepted" e reprovava a ausência, marcando como falha atribuições que
   * o portal já mostrava atribuídas.
   *
   * É a MESMA falha de raciocínio pela terceira vez em dois dias: exigir prova que a fonte não
   * fornece e ler o silêncio como desacordo. Aqui a placa é a prova, e ela basta — a aceitação
   * vira uma checagem extra que só age quando o portal de fato afirma o contrário.
   */
  if (portal.acceptanceStatus != null && portal.acceptanceStatus !== "Accepted") {
    return {
      confirmado: false,
      motivo: `o portal respondeu OK mas a viagem consta como "${portal.acceptanceStatus}"`,
    };
  }

  const enviadas = entrada.enviadas.map(normalizar).filter(Boolean);
  const noPortal = normalizar(portal.plateLabel ?? "");

  if (enviadas.length === 0) {
    return { confirmado: false, motivo: "nenhuma placa foi enviada — não há o que conferir" };
  }
  if (!noPortal) {
    return {
      confirmado: false,
      motivo: "o portal respondeu OK mas não mostra placa nenhuma na viagem",
    };
  }
  // `includes` e não igualdade: quando há cavalo e carreta o portal às vezes devolve as duas no
  // mesmo campo, separadas por vírgula ou barra. Exigir igualdade recusaria uma atribuição correta.
  if (!noPortal.includes(enviadas[0]!)) {
    return {
      confirmado: false,
      motivo: `o portal mostra a placa "${portal.plateLabel}" e nós enviamos "${entrada.enviadas[0]}"`,
    };
  }

  /**
   * ── E O MOTORISTA? A pergunta que faltava (2026-09-04, achada pelo usuário) ─────────────────
   *
   * Até aqui a confirmação olhava só a PLACA. E a placa é a mesma independentemente de quem dirige:
   * o portal podia escalar outra pessoa — ou ignorar o segundo motorista — que o TMS confirmava
   * assim mesmo e gravava `done`.
   *
   * O relato foi exato: "no portal não atribui, no TMS fala que sim". Medido nas 7 atribuições de
   * dois motoristas marcadas como concluídas: em QUATRO o portal ficou com o motorista que mandamos
   * como SEGUNDO, e em uma (LT0Q8R02ES091) com um terceiro que não pedimos — WARLEY AURELIO DOS
   * SANTOS, no lugar dos dois enviados. Todas passaram, porque a placa batia.
   *
   * ── O QUE DÁ PARA PROVAR, E O QUE NÃO DÁ ───────────────────────────────────────────────────
   *
   * O portal devolve UM nome. Numa atribuição de dois, no máximo um é conferível — e é por isso que
   * o veredito diz quantos foram (`motoristasConferidos`), do mesmo jeito que já dizia das placas.
   *
   * Bater com QUALQUER um dos enviados conta como confirmado: o portal ora mostra o da primeira
   * etapa, ora o do pool, e exigir que fosse o primeiro reprovaria atribuições corretas. O que não
   * pode passar é o caso do ES091 — nome que não é nenhum dos dois.
   */
  const nomes = (entrada.motoristasEnviados ?? []).filter((n) => n.trim() !== "");
  const doPortal = portal.driverLabel?.trim() ?? "";
  if (nomes.length > 0 && doPortal !== "" && nomeEntre(doPortal, nomes) === null) {
    return {
      confirmado: false,
      motivo: `o portal mostra o motorista "${doPortal}" e nós escalamos ${nomes
        .map((n) => `"${n}"`)
        .join(" e ")}`,
    };
  }

  const conferidas = enviadas.filter((p) => noPortal.includes(p)).length;
  return {
    confirmado: true,
    detalhe: `o portal mostra a viagem atribuída com a placa ${portal.plateLabel}${
      portal.driverLabel ? ` e o motorista ${portal.driverLabel}` : ""
    }`,
    placasConferidas: conferidas,
    // Um, quando deu para olhar. Zero quando o portal não mostrou nome ou não soubemos os nossos.
    motoristasConferidos: nomes.length > 0 && doPortal !== "" ? 1 : 0,
  };
}
