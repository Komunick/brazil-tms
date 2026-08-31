import { type PgBoss } from "pg-boss";
import {
  corpoDaPesquisa,
  motivosDeNaoPesquisar,
  type CamposDoPreCadastro,
  type MotoristaPesquisarPayload,
} from "@brazil-tms/shared";
import {
  devolverReivindicacaoDaPesquisa,
  gravarResultadoDaPesquisa,
  preCadastroParaConferencia,
  reivindicarPesquisa,
} from "@brazil-tms/db";
import { JOB, work } from "../../lib/queue";
import {
  credenciaisDaIntegra,
  IntegraRecusou,
  setSolicitacaoPesquisaConsulta,
} from "../../lib/integra/cliente";

/**
 * PEDE A PESQUISA À GERENCIADORA — a metade que CUSTA (fatia 028, etapa 6).
 *
 * ⚠️ Cada execução bem-sucedida é uma linha na fatura. Não existe homologação (`CodErro 100`,
 * medido), então a primeira vez que isto rodar já é dinheiro.
 *
 * Todo o desenho deste arquivo sai daí. Compare com o `motorista.cadastrar` ao lado, que é de
 * graça: lá o job varre um lote, tenta de novo quando falha, e repetir é barato. Aqui é o oposto em
 * cada uma dessas escolhas.
 *
 * ── UM POR CLIQUE, E NENHUMA VARREDURA ────────────────────────────────────────────────────────
 *
 * Não há job agendado que enfileire esta fila. O único caminho até aqui é uma pessoa apertando um
 * botão, e o alvo vem no payload. Automatizar gasto é como uma conta cresce sem ninguém decidir.
 *
 * ── A LINHA É REIVINDICADA ANTES DA CHAMADA ───────────────────────────────────────────────────
 *
 * `reivindicarPesquisa` grava `pesquisa_solicitada_em` com `WHERE ... IS NULL`. Quem consegue
 * gravar é quem chama; qualquer segundo clique encontra a linha tomada e sai sem gastar.
 *
 * Verificar antes de chamar não bastaria: entre a verificação e a chamada cabe a segunda aba.
 *
 * ── E QUANDO FALHA, NÃO REPETE ────────────────────────────────────────────────────────────────
 *
 * A reivindicação só é devolvida quando a gerenciadora NÃO chegou a responder — rede caída,
 * credencial faltando. Se ela respondeu qualquer coisa, inclusive erro, a solicitação pode ter sido
 * contabilizada, e liberar convidaria alguém a pedir de novo.
 *
 * Na dúvida entre travar um pedido legítimo e gastar duas vezes, trava: destravar é uma conversa,
 * a cobrança é uma fatura.
 */
export async function registerMotoristaPesquisar(boss: PgBoss): Promise<void> {
  await work(boss, JOB.motoristaPesquisar, async (payload: MotoristaPesquisarPayload) => {
    const cred = credenciaisDaIntegra();
    if (!cred) {
      // Sem credencial a integração está DESLIGADA, que é um estado legítimo — e aqui é o melhor
      // desfecho possível: nada foi reivindicado ainda, então nada trava.
      return;
    }

    const item = await preCadastroParaConferencia(payload.preRegistrationId);
    if (!item) return;

    /**
     * A CONFERÊNCIA ACONTECE COM O DADO DO BANCO, não com o que veio da tela.
     *
     * A tela mostrou os motivos e liberou o botão; entre aquele instante e este, alguém pode ter
     * arquivado a linha ou a leitura pode ter acusado divergência de CPF. Quem decide gastar é esta
     * verificação, feita agora — a da tela existe para explicar, não para autorizar.
     */
    const dados = {
      campos: item.campos as CamposDoPreCadastro,
      cpf: item.cpf,
      enviadoAGerenciadora: item.enviadoEm != null,
      jaPedida: false, // a reivindicação abaixo é quem responde isto, e de forma atômica
      cpfDivergente: Boolean(item.leituraCnh?.cpfDivergente),
      vinculo: payload.vinculo,
    };

    const motivos = motivosDeNaoPesquisar(dados);
    if (motivos.length > 0) {
      await gravarResultadoDaPesquisa(payload.preRegistrationId, payload.solicitadoPor, { motivos });
      return;
    }

    // A partir daqui a linha é nossa — ou de mais ninguém.
    if (!(await reivindicarPesquisa(payload.preRegistrationId, payload.solicitadoPor))) return;

    const opcoes = {
      expressa: payload.expressa,
      pesquisaPlus: payload.pesquisaPlus,
      biometrica: payload.biometrica,
    };

    try {
      const resposta = await setSolicitacaoPesquisaConsulta(
        cred,
        corpoDaPesquisa(dados, opcoes) as unknown as Record<string, unknown>,
      );
      /**
       * O QUE FOI PEDIDO fica junto do que ela respondeu, e é o ponto do registro.
       *
       * A resposta traz `Codigo` (por onde se acompanha o desfecho), `Situacao` e — quando houver —
       * o `PhotocheckUrl`, um link que o CONDUTOR precisa abrir. Se ele vier e ninguém mandar ao
       * motorista, a pesquisa fica parada esperando algo que ele não sabe que existe.
       *
       * As opções vão junto porque são elas que explicam o valor cobrado, e porque a pergunta que
       * alguém fará diante da fatura é "quem pediu, e pediu o quê".
       */
      await gravarResultadoDaPesquisa(payload.preRegistrationId, payload.solicitadoPor, {
        /*
         * O VÍNCULO É GUARDADO, e não como registro histórico: o `getResultadoPesquisaConsulta`
         * pergunta por CPF + VÍNCULO, não pelo código que a solicitação devolveu. Sem ele guardado
         * não há como perguntar o resultado daquilo que se pagou.
         */
        vinculo: payload.vinculo,
        opcoes,
        resposta,
      });
    } catch (erro) {
      const recusa = erro instanceof IntegraRecusou;
      /**
       * A recusa DELA é gravada com a mensagem DELA, sem tradução nossa.
       *
       * E a reivindicação só volta quando a gerenciadora não respondeu — ver o cabeçalho. Uma
       * `IntegraRecusou` É resposta dela: a linha continua travada de propósito.
       */
      await gravarResultadoDaPesquisa(payload.preRegistrationId, payload.solicitadoPor, {
        /*
         * O VÍNCULO É GUARDADO, e não como registro histórico: o `getResultadoPesquisaConsulta`
         * pergunta por CPF + VÍNCULO, não pelo código que a solicitação devolveu. Sem ele guardado
         * não há como perguntar o resultado daquilo que se pagou.
         */
        vinculo: payload.vinculo,
        opcoes,
        erro: recusa
          ? `gerenciadora recusou (CodErro ${(erro as IntegraRecusou).codErro}): ${(erro as IntegraRecusou).msgErro}`
          : erro instanceof Error
            ? erro.message
            : String(erro),
      });
      if (!recusa) await devolverReivindicacaoDaPesquisa(payload.preRegistrationId);
    }
  });
}
