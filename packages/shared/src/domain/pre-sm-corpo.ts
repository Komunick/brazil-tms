import type { OwnershipType } from "../schemas/master-data";
import { paraDataHoraDaIntegra, vinculoParaLogae } from "./pre-sm";

/**
 * O CORPO DO `setPreSM`, e os motivos de não dar (2026-08-26, fatia 027).
 *
 * Tudo aqui é **puro**: sem banco, sem rede, sem relógio. É o que permite provar a montagem inteira
 * por teste, num caminho em que a validação de verdade não existe — a gerenciadora não tem ambiente
 * de homologação para nós (`CodErro 100`, medido).
 *
 * ── ESTE É O ÚNICO ARQUIVO QUE A PENDÊNCIA PODE MUDAR ─────────────────────────────────────────
 *
 * Não se sabe como o `setPreSM` amarra a Pré-SM à programação que a Logae já tem do portal: não há
 * campo de código de programação em nenhum método de criação, conferido na referência extraída do
 * manual (`docs/INTEGRA-14.2-REFERENCIA.md`).
 *
 * Isolar o corpo aqui é o que faz a resposta custar **um arquivo e seus testes**. Espalhado pelo
 * job, mudaria o job, o que se grava, o que a tela mostra e o que os testes esperam.
 *
 * ── TODOS OS MOTIVOS, NÃO O PRIMEIRO ──────────────────────────────────────────────────────────
 *
 * A fatia 026 devolvia um motivo só, o mais acionável, porque ele aparecia enterrado na viagem e
 * mostrar vários confundiria.
 *
 * Aqui o consumidor mudou: na aba GR o motivo **é** a fila. A pessoa está ali para resolver, e
 * descobrir que falta o CPF, resolver, e só então descobrir que também falta o vínculo é duas idas
 * ao cadastro em vez de uma.
 */

export type MotivoDeNaoEnviar =
  | "sem_rota"
  | "sem_cidade_origem"
  | "sem_cidade_destino"
  | "sem_cpf"
  | "sem_placa"
  | "sem_vinculo_veiculo"
  | "sem_vinculo_motorista"
  | "sem_janela_coleta"
  | "sem_janela_entrega";

export interface DadosParaSetPreSM {
  /** Constantes de configuração, do cadastro da gerenciadora. */
  codFilial: number | null;
  codPerfilSeguranca: number | null;
  /** Da ponte de rota, **confirmada**. */
  codRota: number | null;
  /** Da ponte de cidade, **confirmadas**. */
  codIbgeOrigem: number | null;
  codIbgeDestino: number | null;

  cpfMotorista: string | null;
  vinculoMotorista: OwnershipType | null;
  cpfSegundoMotorista?: string | null;
  vinculoSegundoMotorista?: OwnershipType | null;

  /** A primeira é o cavalo; as demais são carretas. */
  placas: { placa: string; vinculo: OwnershipType | null }[];

  chegadaNaColeta: string | null;
  saidaDaColeta: string | null;
  chegadaNaEntrega: string | null;
  saidaDaEntrega: string | null;
}

const soDigitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");
const cpfValido = (s: string | null | undefined) => soDigitos(s).length === 11;

/**
 * TUDO o que falta, na ordem em que se resolve.
 *
 * A ordem não é estética: quem lê a fila age de cima para baixo, e o que **não se resolve na
 * viagem** vem primeiro. Rota e cidade exigem cadastro na gerenciadora ou conferência de uma
 * correspondência; CPF e vínculo se resolvem no nosso cadastro, em minutos.
 *
 * Mostrar "falta CPF" antes de "falta rota" faria alguém correr atrás do documento, resolver, e a
 * linha continuar travada. Trabalho à toa, e a confiança na tela vai junto.
 */
export function motivosDeNaoEnviar(d: DadosParaSetPreSM): MotivoDeNaoEnviar[] {
  const motivos: MotivoDeNaoEnviar[] = [];

  if (!d.codRota) motivos.push("sem_rota");
  if (!d.codIbgeOrigem) motivos.push("sem_cidade_origem");
  if (!d.codIbgeDestino) motivos.push("sem_cidade_destino");

  if (!cpfValido(d.cpfMotorista)) motivos.push("sem_cpf");
  if (d.placas.length === 0) motivos.push("sem_placa");

  // O vínculo do VEÍCULO e o de cada carreta caem no mesmo motivo: os dois se resolvem no mesmo
  // lugar, e distinguir daria à tela uma diferença que não muda o que a pessoa faz.
  if (d.placas.some((p) => vinculoParaLogae(p.vinculo) == null)) {
    motivos.push("sem_vinculo_veiculo");
  }

  // O segundo motorista, quando existe, é cobrado igual ao primeiro.
  const semVinculoMotorista =
    vinculoParaLogae(d.vinculoMotorista) == null ||
    (d.cpfSegundoMotorista != null &&
      d.cpfSegundoMotorista !== "" &&
      vinculoParaLogae(d.vinculoSegundoMotorista) == null);
  if (semVinculoMotorista) motivos.push("sem_vinculo_motorista");

  if (!d.chegadaNaColeta || !d.saidaDaColeta) motivos.push("sem_janela_coleta");
  if (!d.chegadaNaEntrega || !d.saidaDaEntrega) motivos.push("sem_janela_entrega");

  return motivos;
}

export interface CorpoDoSetPreSM {
  PreSM: {
    /** `0` ao incluir. Diferente de zero significa ALTERAR uma existente. */
    Codigo: 0;
    Engate: Record<string, unknown>;
    Detalhamento: { ColetasEntregas: Record<string, unknown>[] };
    Rota: { CodRota: number };
  };
}

/**
 * Monta o corpo — ou devolve `null` quando falta qualquer coisa.
 *
 * **Meio corpo é pior do que nenhum.** Um `setPreSM` incompleto seria recusado pela gerenciadora
 * (custando uma ida) ou, pior, aceito com um campo em branco que ninguém conferiu — e o que está em
 * branco numa solicitação de escolta é justamente o que a escolta usa.
 */
export function montarCorpoDoSetPreSM(d: DadosParaSetPreSM): CorpoDoSetPreSM | null {
  if (motivosDeNaoEnviar(d).length > 0) return null;
  if (!d.codFilial || !d.codPerfilSeguranca) return null;

  const [cavalo, ...carretas] = d.placas;
  if (!cavalo) return null;

  const engate: Record<string, unknown> = {
    CodFilial: d.codFilial,
    CodPerfilSeguranca: d.codPerfilSeguranca,
    PlacaVeiculo: cavalo.placa,
    VincVeiculo: vinculoParaLogae(cavalo.vinculo),
    CPFMotorista1: soDigitos(d.cpfMotorista),
    VincMotorista1: vinculoParaLogae(d.vinculoMotorista),
  };

  if (d.cpfSegundoMotorista && cpfValido(d.cpfSegundoMotorista)) {
    engate.CPFMotorista2 = soDigitos(d.cpfSegundoMotorista);
    engate.VincMotorista2 = vinculoParaLogae(d.vinculoSegundoMotorista);
  }

  // A Integra aceita até três carretas, cada uma com o seu vínculo.
  carretas.slice(0, 3).forEach((c, i) => {
    engate[`PlacaCarreta${i + 1}`] = c.placa;
    engate[`VincCarreta${i + 1}`] = vinculoParaLogae(c.vinculo);
  });

  return {
    PreSM: {
      Codigo: 0,
      Engate: engate,
      Detalhamento: {
        ColetasEntregas: [
          {
            Tipo: "COLETA",
            CodIBGECidade: d.codIbgeOrigem,
            DataHoraChegada: paraDataHoraDaIntegra(d.chegadaNaColeta!),
            DataHoraSaida: paraDataHoraDaIntegra(d.saidaDaColeta!),
          },
          {
            Tipo: "ENTREGA",
            CodIBGECidade: d.codIbgeDestino,
            DataHoraChegada: paraDataHoraDaIntegra(d.chegadaNaEntrega!),
            DataHoraSaida: paraDataHoraDaIntegra(d.saidaDaEntrega!),
          },
        ],
      },
      Rota: { CodRota: d.codRota! },
    },
  };
}
