"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Truck } from "lucide-react";
import {
  alertaDoMotorista,
  formatDate,
  impedimentoDaAtribuicao,
  normalizarPlaca,
  placasDoPortal,
  placasEsperadas,
  type VehicleType,
} from "@brazil-tms/shared";
import type { MotoristaDoPortal } from "@brazil-tms/db";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PlacasDoMotorista } from "@/components/trips/placas-do-motorista";
import { aplicarPlacaSugerida } from "@/lib/trips/placa-sugerida";
import { MelhoresDaRota } from "@/components/trips/melhores-da-rota";
import {
  TripsError,
  useOrdensDoPortal,
  useRecarregarViagens,
  usePortalAction,
  usePortalDrivers,
  usePortalPlacas,
  useVinculosDasPlacas,
} from "@/lib/trips/client";
import { VinculoDoRecurso, type VinculoEscolhido } from "@/components/trips/vinculo-do-recurso";
import { VeiculosPorPerto } from "@/components/trips/veiculos-por-perto";

/**
 * ESCALAR MOTORISTA E PLACA SEM ABRIR O PORTAL (2026-08-21, a pedido).
 *
 * A segunda metade do fluxo do aceite. No portal, aceitar leva a esta mesma tela; aqui ela abre a
 * partir da aba "Atribuir" — que é a fila de quem já foi aceito e ainda não tem quem dirija.
 *
 * ── O MOTORISTA VEM DA LISTA DO PORTAL, NÃO DO NOSSO CADASTRO ──────────────────────────────────
 *
 * O portal aceita o id DELE, e só quem está no cadastro dele. Nosso cadastro tem 1.378 nomes; o que
 * serve aqui são os 536 que o portal já nos mostrou em viagens reais — ordenados por quem rodou mais
 * recentemente, que é como a operação pensa neles. Ver `portal-drivers.ts`.
 *
 * ── UMA OU DUAS PLACAS ─────────────────────────────────────────────────────────────────────────
 *
 * Carreta leva duas (cavalo e reboque); o resto leva uma. O padrão vem do tipo do veículo da viagem,
 * mas o campo é ACRESCENTÁVEL: a regra é nossa sobre um dado do fornecedor, e no dia em que ela não
 * couber, quem está olhando a viagem conserta na hora — em vez de ficar preso a um formulário que
 * discorda do que está na frente dele.
 */
export function PortalAssignDialog({
  tripId,
  externalTripId,
  vehicleType,
  driverAtual,
  placaAtual,
  origem,
  onSent,
  quantosMelhores,
  onVerHistorico,
  open,
  onOpenChange,
}: {
  tripId: string;
  externalTripId: string | null;
  /** O tipo planejado da viagem — decide quantas placas o formulário abre pedindo. */
  vehicleType: VehicleType | null;
  /**
   * O que o PORTAL tem escalado hoje, para a edição abrir preenchida — como a dele abre.
   *
   * Sem isto, trocar só o motorista obrigaria a redigitar a placa, e redigitar é onde o erro entra.
   * Vem do portal e não da atribuição do TMS de propósito: o que se está editando é o que o CLIENTE
   * enxerga.
   */
  driverAtual?: string | null;
  placaAtual?: string | null;
  /**
   * A ESTAÇÃO DE ORIGEM, como o portal a escreve (`SOC_SP_GUARULHOS`).
   *
   * Serve só para o painel de veículos por perto. Opcional de propósito: quem não passar continua
   * com o formulário de sempre, e o painel simplesmente não aparece — nada quebra.
   */
  origem?: string | null;
  /** Chamado quando a ordem entrou na fila — quem desenha usa para acompanhar o resultado. */
  onSent?: () => void;
  /**
   * Quantos nomes o ranking mostra, e o que fazer no botão de histórico ao lado de cada um.
   *
   * Existem porque a Minha Programação abre este mesmo diálogo numa janela larga, onde cabem dez
   * nomes e onde o histórico do motorista foi pedido (2026-08-24). Na Expedição o diálogo é
   * estreito e nenhum dos dois vem — o padrão do ranking continua valendo.
   */
  quantosMelhores?: number;
  onVerHistorico?: (driverId: string, nome: string) => void;
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
}) {
  const t = useTranslations("Trips.portalAssign");
  const motoristas = usePortalDrivers();
  const placasConhecidas = usePortalPlacas();
  const acao = usePortalAction(tripId);
  const recarregarViagens = useRecarregarViagens();
  /**
   * A ORDEM QUE ESTAMOS ESPERANDO FECHAR (2026-08-28, a pedido).
   *
   * ── O QUE ACONTECIA ANTES ─────────────────────────────────────────────────────────────────
   *
   * O diálogo fechava assim que o servidor respondia 202 — que quer dizer "enfileirei", não
   * "atribuí". O caminho tem três tempos (o TMS enfileira, o robô pega, o portal responde) e a
   * pessoa via o primeiro e ia embora. Quando o portal recusava, ela já não estava lá.
   *
   * Agora o diálogo SEGURA: guarda o id da ordem e acompanha até ela fechar. Deu certo, some com
   * a mensagem de sempre; falhou, mostra o motivo do portal e fica aberto para refazer — que é
   * exatamente o pedido ("se a ação não tiver sido concluída dá erro e nada é enviado").
   *
   * O id vem da resposta do POST, e não do topo da lista: duas ordens da mesma viagem podem estar
   * em voo (alguém corrigindo uma atribuição logo depois de outra), e pegar "a mais recente"
   * mostraria o desfecho da ordem errada.
   */
  const [aguardando, setAguardando] = useState<string | null>(null);
  /** A janela de confirmação: o portal já respondeu, e a pessoa ainda não viu. Ver o efeito. */
  const [confirmado, setConfirmado] = useState(false);
  const ordens = useOrdensDoPortal(tripId, aguardando !== null);
  const ordem = ordens.data?.items?.find((o) => o.id === aguardando) ?? null;
  const emVoo = acao.isPending || aguardando !== null || confirmado;

  const quantas = placasEsperadas(vehicleType);
  const [driverId, setDriverId] = useState(driverAtual ?? "");
  const [secondDriverId, setSecondDriverId] = useState("");
  /**
   * AS PLACAS DO PORTAL VÊM NUMA STRING SÓ, separadas por vírgula (2026-08-22).
   *
   * Uma carreta chega como `"PXW0I78,EMU0J25"` — cavalo e reboque no mesmo campo. A primeira
   * versão disto jogava a string inteira no campo 1, e como `normalizarPlaca` apaga tudo que não
   * é letra ou número, a vírgula sumia e o campo virava `"PXW0I78EMU0J25"`: as duas placas
   * grudadas num campo, o segundo vazio. Foi o usuário quem viu.
   *
   * QUANTOS CAMPOS MOSTRAR sai do maior entre o que o tipo do veículo pede e o que o portal já
   * tem. O tipo é uma regra NOSSA sobre um dado deles e pode envelhecer; o que está escalado hoje
   * é fato. Quando os dois discordam, esconder uma placa que existe seria o pior dos erros —
   * salvar apagaria do portal um reboque que ninguém pediu para tirar.
   */
  const [placas, setPlacas] = useState<string[]>(() => {
    const doPortal = placasDoPortal(placaAtual);
    const campos = Math.max(quantas, doPortal.length);
    return Array.from({ length: campos }, (_, i) => doPortal[i] ?? "");
  });

  /**
   * NÃO HÁ EFEITO PARA LIMPAR O FORMULÁRIO — e essa ausência é a correção.
   *
   * A primeira versão limpava os campos num `useEffect` ao abrir. Para calar o lint eu pus o objeto
   * da mutação nas dependências, e ele é RECRIADO a cada render: efeito roda, muda estado,
   * re-renderiza, roda de novo. Laço infinito, e a tela inteira caiu com "Maximum update depth" —
   * na primeira vez que alguém tentou atribuir de verdade.
   *
   * Quem garante o formulário limpo agora é o `key={row.id}` de quem desenha este diálogo: trocar de
   * viagem MONTA outro componente, e estado novo nasce vazio por definição. Sem efeito, sem
   * dependência para errar, e sem o risco de herdar o motorista da viagem anterior — que era o que
   * o efeito existia para evitar.
   */
  /**
   * As placas em OPÇÕES, memoizadas uma vez para todos os campos.
   *
   * Dentro do `map` seriam duas ou três listas de 936 itens reconstruídas a cada tecla digitada em
   * qualquer um deles.
   */
  const opcoesDePlaca = useMemo(
    () => (placasConhecidas.data?.items ?? []).map((p) => ({ id: p.placa, label: p.placa })),
    [placasConhecidas.data],
  );

  const opcoes = useMemo(
    () =>
      (motoristas.data?.items ?? []).map((m) => ({
        id: String(m.portalDriverId),
        label: m.name,
        /**
         * BLOQUEADO: aparece riscado e não dá para escolher (2026-08-25, a pedido).
         *
         * Some da lista seria pior — quem procura o nome e não o acha conclui que o cadastro se
         * perdeu, e vai procurar o defeito errado.
         *
         * Isto é conveniência, não garantia. Quem estiver com esta página aberta desde antes do
         * bloqueio ainda tem o nome selecionável; quem recusa de verdade é o servidor, dentro da
         * transação que trava a viagem (`enfileirarOrdemDoPortal`).
         */
        disabled: m.bloqueio != null,
        hint: m.bloqueio ? t("driverBlocked") : undefined,
      })),
    [motoristas.data],
  );

  /**
   * O VÍNCULO DE CADA RECURSO (2026-08-25, fatia 026).
   *
   * Guardado por POSIÇÃO, na mesma ordem de `placas`: a primeira é o cavalo, as seguintes são
   * carretas. Amarrar por posição e não por placa faz o vínculo acompanhar o campo quando alguém
   * corrige uma digitação no meio do formulário — por placa, a correção desassociaria a escolha do
   * veículo a que ela se referia.
   *
   * Começa vazio: o que já está classificado vem do cadastro (ver `vinculoDaPlaca` abaixo) e não
   * precisa de estado local, porque não é editável aqui.
   */
  const [vinculoDasPlacas, setVinculoDasPlacas] = useState<(VinculoEscolhido | null)[]>([]);
  const [vinculoMotorista, setVinculoMotorista] = useState<VinculoEscolhido | null>(null);
  const [vinculoSegundo, setVinculoSegundo] = useState<VinculoEscolhido | null>(null);

  /**
   * O clique numa placa sugerida — primeiro campo vazio, e TROCA quando não há vazio.
   *
   * A regra mora em `aplicarPlacaSugerida`, sob teste: até 31/08 ela desistia quando tudo estava
   * cheio, e num truck (um campo só) isso queria dizer que apenas o PRIMEIRO clique funcionava.
   *
   * ── E O VÍNCULO DA POSIÇÃO SAI JUNTO ───────────────────────────────────────────────────────────
   *
   * `vinculoDasPlacas` é guardado por POSIÇÃO. Quando a sugestão substitui a placa de um campo, o
   * vínculo escolhido ali descrevia o veículo ANTERIOR — mantê-lo mandaria "agregado" para um
   * caminhão da frota sem ninguém ver. Limpar devolve o campo ao que o cadastro sabe
   * (`jaClassificados`), que é de onde ele teria vindo se a placa nova tivesse sido escolhida do
   * zero.
   *
   * Digitar por cima NÃO limpa, e é de propósito: quem corrige uma letra está falando da mesma
   * placa. Clicar noutra sugestão é trocar de veículo.
   */
  const escolherSugestao = (nova: string) => {
    /*
      Calculado FORA do updater, e não dentro: o updater do `useState` roda na renderização
      seguinte, então uma variável escrita lá dentro ainda estaria vazia na linha de baixo. Num
      manipulador de evento, `placas` já é o valor desta renderização — que é o que o clique viu.
    */
    const r = aplicarPlacaSugerida(placas, nova);
    setPlacas(r.placas);
    const trocado = r.substituiu;
    if (trocado != null) {
      setVinculoDasPlacas((atual) => atual.map((v, j) => (j === trocado ? null : v)));
    }
  };

  const preenchidas = placas.map(normalizarPlaca).filter(Boolean);
  const jaClassificados = useVinculosDasPlacas(preenchidas, open);

  const escolhido = (m: MotoristaDoPortal | undefined) => m?.vinculo ?? null;
  const doMotorista = escolhido(
    motoristas.data?.items?.find((m) => String(m.portalDriverId) === driverId),
  );
  const doSegundo = escolhido(
    motoristas.data?.items?.find((m) => String(m.portalDriverId) === secondDriverId),
  );
  const impedimento = impedimentoDaAtribuicao({
    driverId: Number(driverId) || 0,
    secondDriverId: secondDriverId ? Number(secondDriverId) : null,
    plates: preenchidas,
  });
  /**
   * O DESFECHO DA ORDEM.
   *
   * `done` fecha o diálogo; `failed` para a espera e deixa o erro à vista, com o diálogo aberto —
   * a pessoa refaz sem redigitar tudo.
   *
   * Efeito, e não lógica no render: fechar o diálogo é efeito colateral, e `onOpenChange` durante
   * a renderização derruba o React.
   */
  useEffect(() => {
    if (!ordem) return;
    if (ordem.status === "done") {
      setAguardando(null);
      // A recarga do quadro acontece AQUI, e não no 202: é agora que a viagem de fato mudou. Ver
      // o comentário em `usePortalAction`.
      recarregarViagens();
      onSent?.();
      /**
       * O DIÁLOGO NÃO FECHA NA HORA — ele CONFIRMA primeiro (2026-08-29, a pedido).
       *
       * Fechava direto, e o único sinal de sucesso era um aviso no canto inferior. A pessoa
       * apertava, a janela sumia, e ela ficava sem saber se a viagem foi atribuída — indo conferir
       * no portal, que é justamente o passo que este recurso existe para eliminar.
       *
       * Agora o caminhão vira um ✓ na mesma caixa que ela já estava olhando, com a frase dizendo
       * que o PORTAL confirmou. Um segundo e meio: tempo de ler, curto demais para irritar.
       *
       * O `setConfirmado` mantém a cobertura na tela durante esse tempo — ver `emVoo`.
       */
      setConfirmado(true);
    } else if (ordem.status === "failed") {
      setAguardando(null);
    }
  }, [ordem, onSent]);

  // Fecha depois de a confirmação ter sido VISTA. Separado do efeito acima porque são dois
  // momentos: um é "o portal confirmou", o outro é "a pessoa já leu".
  useEffect(() => {
    if (!confirmado) return;
    const t = setTimeout(() => {
      setConfirmado(false);
      onOpenChange(false);
    }, 1_500);
    return () => clearTimeout(t);
  }, [confirmado, onOpenChange]);

  /**
   * A VÁLVULA DE ESCAPE — a espera não pode prender ninguém (2026-08-28).
   *
   * A cobertura bloqueia fechar a janela, e isso é o ponto dela. Mas ela depende de a ordem
   * FECHAR para sair, e há caminhos em que isso não acontece: a consulta de estado pode falhar, a
   * rede pode cair, o navegador pode voltar do sono. Nesses casos a pessoa ficaria presa numa tela
   * cinza sem botão nenhum — trocando um problema por outro pior.
   *
   * Passados VINTE E CINCO SEGUNDOS, a espera solta. É bem mais que o caminho normal, que leva
   * poucos segundos, e bem menos que os três minutos de validade da ordem.
   *
   * ── E A MENSAGEM NÃO DIZ "REFAÇA" ─────────────────────────────────────────────────────────
   *
   * Deliberado. Soltar a espera NÃO cancela a ordem: ela continua valendo por até três minutos, e
   * o robô ainda pode executá-la. Mandar refazer aqui criaria a atribuição em dobro, que é pior do
   * que a demora. A frase manda CONFERIR antes — e é a verdade do que está acontecendo.
   */
  useEffect(() => {
    if (!aguardando) return;
    const t = setTimeout(() => setAguardando(null), 25_000);
    return () => clearTimeout(t);
  }, [aguardando]);

  /*
   * O erro pode vir de DOIS lugares, e os dois precisam aparecer no mesmo canto: a recusa do
   * servidor ao enfileirar (regra nossa) e a recusa do portal ao executar (regra deles).
   */
  const erroDoServidor =
    (acao.error instanceof TripsError ? acao.error.message : null) ??
    (ordem?.status === "failed" ? (ordem.lastError ?? t("falhouSemMotivo")) : null) ??
    /*
      A ordem existe e continua aberta, mas a espera soltou pelo tempo. Não é erro — é "ainda não
      sei", e a frase precisa dizer isso sem mandar refazer, senão vira atribuição em dobro.
    */
    (!aguardando && ordem && (ordem.status === "pending" || ordem.status === "sent")
      ? t("aindaEmVoo")
      : null);

  return (
    /*
      FECHAR FICA BLOQUEADO ENQUANTO A ORDEM ESTÁ EM VOO (2026-08-28, a pedido).

      O `onOpenChange` do Dialog dispara no Esc, no clique fora e no X. Passá-lo direto deixava a
      pessoa fechar no meio do envio — e aí a ordem seguia sem ninguém para ver o desfecho, que é
      exatamente o silêncio que este trabalho veio desfazer.

      Só o FECHAR é barrado. Abrir continua livre, e o efeito do desfecho fecha normalmente.
    */
    <Dialog open={open} onOpenChange={(v) => (emVoo && !v ? undefined : onOpenChange(v))}>
      {/*
        NADA DE `relative` AQUI (2026-08-28, defeito e conserto no mesmo dia).

        Eu tinha posto `relative` para a cobertura de carregamento se ancorar neste elemento. O
        `DialogContent` do Radix se posiciona com `fixed left-1/2 top-1/2` e dois `translate` — a
        classe nova venceu a do componente, o diálogo perdeu a centralização e passou a abrir no
        fluxo da página, descendo para fora da tela. O botão de confirmar ficava inalcançável.

        A cobertura não precisa disso: ela é `fixed inset-0`, cobre a viewport inteira e fica acima
        de tudo. Ver o comentário dela.
      */}
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        {/**
          A COBERTURA DE CARREGAMENTO (2026-08-28, a pedido).

          Era um texto no rodapé, e o pedido foi um popup no meio — para a pessoa não fechar sem
          querer. É uma camada, e não outro diálogo: um segundo modal em cima do primeiro empilha
          duas armadilhas de foco, e o leitor de tela passa a anunciar duas janelas para uma coisa só.

          ── `fixed`, E NÃO `absolute` ──────────────────────────────────────────────────────────

          A primeira versão era `absolute inset-0`, e para isso eu tinha posto `relative` no
          `DialogContent` — que se posiciona com `fixed` e dois `translate`. A classe nova venceu, o
          diálogo perdeu a centralização e abriu no fluxo da página, descendo para fora da tela.

          Sendo `fixed inset-0`, a cobertura toma a viewport inteira sem pedir nada ao elemento pai.
          Nada embaixo recebe clique — a proteção é física, não só visual — e o `z-[60]` a põe acima
          do `z-50` do próprio diálogo, que é o teto do Radix aqui.

          `aria-live="assertive"` porque isto interrompe o que a pessoa estava fazendo: ela precisa
          ouvir, não descobrir depois.
        */}
        {emVoo ? (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-[2px]"
            role="status"
            aria-live="assertive"
          >
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-6 shadow-lg">
              {/*
                DUAS CENAS NA MESMA CAIXA, e é isso que faz a confirmação ser vista (2026-08-29).

                Enquanto espera, o caminhão anda. Quando o portal CONFIRMA, ele vira um ✓ no mesmo
                lugar — a pessoa já está olhando para ali, e não precisa procurar a notícia em outro
                canto da tela. O aviso do rodapé não servia: aparece longe do olhar e some sozinho.
              */}
              {confirmado ? <ConfirmadoNoPortal /> : <CaminhaoNaEstrada />}
              <p className={cn("text-sm font-medium", confirmado && "text-success")}>
                {confirmado ? t("confirmado") : t("efetuando")}
              </p>
              <p className="max-w-[22rem] text-center text-xs text-muted-foreground">
                {confirmado ? t("confirmadoDica") : t("efetuandoDica")}
              </p>
            </div>
          </div>
        ) : null}
        <DialogHeader>
          <DialogTitle>{driverAtual ? t("titleEdit") : t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle", { lh: externalTripId ?? tripId })}</DialogDescription>
        </DialogHeader>

        {/*
          OS VEÍCULOS PERTO DA ORIGEM ficam ACIMA das duas colunas, e recolhidos (2026-08-26).

          Acima porque a pergunta que eles respondem — "quem está na cidade da coleta agora" — vem
          ANTES de escolher motorista e placa, não depois. Embaixo, chegaria com a decisão tomada.

          Recolhidos porque a maioria das atribuições não precisa deles: quem já sabe quem vai
          dirigir só quer preencher os campos. Aberto, ocupa a tela toda; fechado, uma linha que
          diz quantos estão por perto — o que já é meia resposta.
        */}
        <VeiculosPorPerto
          origem={origem ?? null}
          /* Escolher no painel PREENCHE o primeiro campo de placa, e não grava nada: quem manda
             continua sendo o botão de confirmar. */
          aoEscolherPlaca={(p) =>
            setPlacas((atual) => atual.map((v, i) => (i === 0 ? normalizarPlaca(p) : v)))
          }
        />

        {/**
         * DUAS COLUNAS: o formulário e, ao lado, quem já entregou bem NESTA rota.
         *
         * Ao lado e não embaixo — a lista existe para ser lida ENQUANTO se escolhe o nome, e um
         * painel abaixo do botão de confirmar chega depois da decisão. Em tela estreita ele desce,
         * porque aí não há "ao lado".
         *
         * Ele NÃO seleciona ninguém: é sugestão ao lado do campo. Motorista tem folga, região,
         * carreta e mil coisas que o TMS não sabe.
         */}
        <div className="grid gap-4 sm:grid-cols-[1fr_18rem]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`motorista-${tripId}`}>{t("driver")}</Label>
              <SearchableSelect
                id={`motorista-${tripId}`}
                value={driverId}
                onChange={setDriverId}
                options={opcoes}
                placeholder={motoristas.isLoading ? t("loadingDrivers") : t("driverPlaceholder")}
                emptyText={t("noDriver")}
                /*
                  TRÊS LETRAS ANTES DE MOSTRAR NOME (2026-08-27, a pedido).

                  São ~600 motoristas, e o usuário descreveu o efeito: "hoje só de você apertar em
                  motorista, vai todos os nomes". Com seiscentas linhas nenhuma ordem ajuda — o que
                  a pessoa vai fazer é digitar, e o mínimo só para de mostrar ruído enquanto ela não
                  digitou.

                  A placa NÃO ganha o mesmo: lá folhear é uso legítimo, e a sugestão do histórico do
                  motorista já resolve o caso comum.
                */
                minChars={3}
                minCharsText={t("typeToSearch", { n: "3" })}
              />
              <AvisoDaCnh driverId={driverId} motoristas={motoristas.data?.items} />
              {driverId ? (
                /*
                  A ESCOLHA DESTA TELA VEM PRIMEIRO (30/08, a pedido).

                  Era `doMotorista ?? vinculoMotorista`: o cadastro ganhava SEMPRE. O clique mudava o
                  estado, a tela continuava mostrando o valor antigo, e no envio a escolha virava
                  `null`. Nas palavras do usuário, "não dá pra alterar mais".

                  O componente já tinha sido consertado em 28/08 para nunca virar texto — mas o
                  conserto foi no lugar errado. Quem travava era quem o chamava, e o botão ficou
                  clicável e inerte, que é pior do que desabilitado: um botão desabilitado ao menos
                  diz que não vai funcionar.

                  Invertido, o cadastro é só o PADRÃO. `jaClassificado` só vale enquanto ninguém
                  mexeu — depois de mexer, "do cadastro" seria mentira sobre o que está na tela.
                */
                <VinculoDoRecurso
                  rotulo={t("driver")}
                  valor={vinculoMotorista ?? doMotorista}
                  jaClassificado={doMotorista != null && vinculoMotorista == null}
                  aoEscolher={setVinculoMotorista}
                />
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`motorista2-${tripId}`}>{t("secondDriver")}</Label>
              <SearchableSelect
                id={`motorista2-${tripId}`}
                value={secondDriverId}
                onChange={setSecondDriverId}
                options={opcoes}
                placeholder={t("secondDriverPlaceholder")}
                emptyText={t("noDriver")}
                clearable
                clearLabel={t("noSecondDriver")}
                /* Mesma lista, mesmo tamanho, mesmo mínimo. O "sem segundo motorista" continua
                   visível antes das três letras — é ação fixa, não resultado de busca. */
                minChars={3}
                minCharsText={t("typeToSearch", { n: "3" })}
              />
              <AvisoDaCnh driverId={secondDriverId} motoristas={motoristas.data?.items} />
              {secondDriverId ? (
                <VinculoDoRecurso
                  rotulo={t("secondDriver")}
                  valor={vinculoSegundo ?? doSegundo}
                  jaClassificado={doSegundo != null && vinculoSegundo == null}
                  aoEscolher={setVinculoSegundo}
                />
              ) : null}
            </div>

            {/*
              AS PLACAS QUE ESTE MOTORISTA JÁ RODOU — logo acima dos campos (2026-08-27, a pedido).

              A posição é a mensagem: ela aparece DEPOIS de escolher o motorista e ANTES de mexer na
              placa, que é exatamente a ordem em que a dúvida acontece. Embaixo dos campos seria uma
              resposta chegando tarde; ao lado, num diálogo estreito, empurraria os campos.

              O clique preenche o primeiro campo vazio, e TROCA quando não há vazio — ver
              `aplicarPlacaSugerida`. A placa que já está num campo aparece marcada, para a tira
              dizer o que está escolhido em vez de o campo lá embaixo ser a única pista.
            */}
            <PlacasDoMotorista
              driverId={driverId}
              aoEscolher={escolherSugestao}
              escolhidas={preenchidas}
            />

            {placas.map((placa, i) => (
              <div key={i} className="space-y-1.5">
                {/**
                  O RÓTULO DIZ QUANDO A PLACA NÃO VAI AO PORTAL (2026-08-28, a pedido).

                  O portal aceita um número de placas que depende do tipo da LH — uma no truck, duas
                  na carreta —, e recusa a atribuição inteira quando recebe a mais. A operação, no
                  entanto, precisa registrar a carreta que seguiu junto de um truck.

                  A regra, dita por quem opera: a PRIMEIRA placa é a que vai ao portal; o que passar
                  disso fica como controle interno do TMS. O servidor faz esse corte ao enfileirar
                  (ver `enfileirarOrdemDoPortal`), e este rótulo é o que impede a surpresa — sem ele,
                  a pessoa preencheria os dois campos achando que os dois seguem.
                */}
                <Label htmlFor={`placa-${tripId}-${i}`}>
                  {placas.length > 1 ? t("plateN", { n: String(i + 1) }) : t("plate")}
                  {i >= quantas ? (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      {t("soNoTms")}
                    </span>
                  ) : null}
                </Label>
                <div className="flex gap-2">
                  {/*
                    A PLACA VEM DE LISTA, como o motorista (2026-08-26, a pedido).

                    Era campo de texto livre ao lado de um motorista que vinha de lista, e a
                    assimetria custava caro: quem digita erra, e uma placa errada no portal é uma
                    ordem errada que JÁ SAIU.

                    ── `livre`, e não uma lista estrita ──────────────────────────────────────

                    A lista sai do que o portal já usou — 936 placas, medidas em 26/08. Um caminhão
                    novo, na primeira viagem dele, não está lá. Recusar o que a pessoa digitou
                    impediria justamente a atribuição que ela precisa fazer, e a lista deixaria de
                    ser ajuda para virar obstáculo. Aqui ela SUGERE; quem manda é quem escala.

                    `mode="plate"` faz a busca ignorar hífen e espaço: "abc-1d23" acha "ABC1D23".
                  */}
                  <div className="flex-1">
                    <SearchableSelect
                      id={`placa-${tripId}-${i}`}
                      value={placa}
                      onChange={(v) =>
                        setPlacas((atual) =>
                          atual.map((p, j) => (j === i ? normalizarPlaca(v) : p)),
                        )
                      }
                      options={opcoesDePlaca}
                      placeholder={
                        placasConhecidas.isLoading ? t("loadingPlates") : t("platePlaceholder")
                      }
                      emptyText={t("noPlate")}
                      mode="plate"
                      livre
                    />
                  </div>
                  {placas.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setPlacas((atual) => atual.filter((_, j) => j !== i))}
                    >
                      {t("removePlate")}
                    </Button>
                  ) : null}
                </div>
                {/* O vínculo acompanha a placa, e só aparece depois de ela estar preenchida —
                    perguntar a classificação de um campo vazio não faz sentido. */}
                {normalizarPlaca(placa) ? (
                  <VinculoDoRecurso
                    rotulo={
                      placas.length > 1 && i > 0 ? t("plateN", { n: String(i + 1) }) : t("plate")
                    }
                    /* A escolha desta tela vem primeiro — mesma inversão do motorista, mesmo motivo. */
                    valor={vinculoDasPlacas[i] ?? jaClassificados[normalizarPlaca(placa)] ?? null}
                    jaClassificado={
                      jaClassificados[normalizarPlaca(placa)] != null && vinculoDasPlacas[i] == null
                    }
                    aoEscolher={(v) =>
                      setVinculoDasPlacas((atual) => {
                        const proximo = [...atual];
                        proximo[i] = v;
                        return proximo;
                      })
                    }
                  />
                ) : null}
              </div>
            ))}

            {/*
              O BOTÃO DIZ O QUE VAI ACONTECER COM A PLACA A MAIS (30/08, a pedido).

              A divisão já existia e funcionava desde 28/08 — e NUNCA foi usada. Medido em produção:
              das ordens de truck dos últimos catorze dias, `plates_internas` está vazia em TODAS.

              O histórico explica. Em 28/08, às 09:48, um truck com duas placas foi recusado pelo
              portal ("Quantidade incorreta do número do veículo"); às 09:49, um minuto depois, a
              mesma pessoa refez com UMA placa e passou. O mesmo padrão às 11:58. A partir daí, todo
              truck vai com uma placa só — e a carreta que seguiu junto não fica registrada em lugar
              nenhum, que é exatamente o que a coluna interna existe para evitar.

              O rótulo do campo já dizia "só no TMS, não vai ao portal". Só que ele aparece DEPOIS
              de acrescentar o campo, e quem foi recusado uma vez lê "Acrescentar placa" como o botão
              que quebrou da outra vez. A informação certa chegava tarde demais para ser usada.

              Aqui ela vem ANTES do clique, e só quando o portal já está satisfeito — numa carreta,
              a segunda placa VAI ao portal e o texto normal está correto.
            */}
            {placas.length < 2 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPlacas((a) => [...a, ""])}
              >
                {placas.length >= quantas ? t("addPlateInterna") : t("addPlate")}
              </Button>
            ) : null}

            {erroDoServidor ? (
              <p role="alert" className="text-sm text-destructive">
                {erroDoServidor}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("hint")}</p>
          </div>

          <MelhoresDaRota
            tripId={tripId}
            aberto={open}
            opcoes={opcoes}
            onEscolher={setDriverId}
            quantos={quantosMelhores}
            onVerHistorico={onVerHistorico}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={emVoo} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            disabled={emVoo || impedimento !== null}
            onClick={() =>
              acao.mutate(
                {
                  action: "assign",
                  driverId: Number(driverId),
                  secondDriverId: secondDriverId ? Number(secondDriverId) : null,
                  plates: preenchidas,
                  /**
                   * SÓ O QUE ESTA TELA ESCOLHEU — e agora isso inclui a CORREÇÃO (30/08, a pedido).
                   *
                   * Estava `jaClassificados[p] != null ? null : ...`, que descartava a escolha
                   * sempre que o recurso já tinha classificação. O comentário antigo justificava com
                   * "a gravação ignoraria de qualquer jeito (ela só preenche vazio)" — e isso deixou
                   * de ser verdade em 28/08: `pre-sm-vinculos.ts` passou a sobrescrever, justamente
                   * para a correção ser possível de onde ela é notada.
                   *
                   * Naquele dia mudaram o componente e o servidor, e este ponto no meio ficou. O
                   * resultado era o pior dos três mundos: os botões apareciam, o clique não mudava
                   * a tela, e o que fosse escolhido virava `null` na ida.
                   *
                   * Os estados locais continuam nascendo VAZIOS, então `null` aqui é "ninguém mexeu"
                   * — não uma reafirmação do que já estava. Quem não tocou não gera escrita.
                   */
                  vinculos: {
                    placas: preenchidas.map((_p, i) => vinculoDasPlacas[i] ?? null),
                    motorista: vinculoMotorista,
                    segundoMotorista: vinculoSegundo,
                  },
                },
                {
                  /*
                    202 QUER DIZER "ENFILEIREI", NÃO "ATRIBUÍ".

                    Fechar aqui era o defeito: a pessoa saía antes de o portal responder. Agora este
                    ponto só inicia a espera; quem fecha é o efeito que acompanha a ordem.
                  */
                  onSuccess: (resposta) => setAguardando(resposta.item.id),
                },
              )
            }
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O QUE HÁ DE ERRADO COM A CNH de quem foi escolhido (2026-08-25, a pedido).
 *
 * ── POR QUE ISTO NÃO EXISTIA ──────────────────────────────────────────────────────────────────
 *
 * A verificação de documento vencido existe no TMS desde a 006, em `evaluateAssignmentEligibility`
 * — mas presa ao formulário INTERNO de escala, que é o caminho que ninguém usa: das atribuições
 * vigentes em produção, uma única foi feita por uma pessoa. Quem escala usa este diálogo, e aqui
 * não havia verificação nenhuma.
 *
 * O resultado, medido em 2026-08-25: três motoristas ativos com CNH vencida, e os TRÊS rodaram na
 * semana. Não foi decisão de correr o risco — a tela nunca disse.
 *
 * ── AVISA, NÃO BARRA ──────────────────────────────────────────────────────────────────────────
 *
 * Ver `alertaDoMotorista`. Em resumo: dezesseis motoristas ativos não têm data no cadastro, e uma
 * trava os trataria como irregulares sem prova — parando a operação com base no que não medimos.
 *
 * ── SILENCIOSO QUANDO ESTÁ EM DIA ─────────────────────────────────────────────────────────────
 *
 * Nada aparece no caso normal. Um "CNH em dia" verde em toda atribuição vira decoração, e decoração
 * é o que ensina o olho a pular a linha — inclusive no dia em que ela ficar vermelha.
 */
function AvisoDaCnh({
  driverId,
  motoristas,
}: {
  driverId: string;
  motoristas: MotoristaDoPortal[] | undefined;
}) {
  const t = useTranslations("Trips.portalAssign");
  if (!driverId || !motoristas) return null;

  const escolhido = motoristas.find((m) => String(m.portalDriverId) === driverId);
  // Motorista que a lista do portal traz mas o nosso cadastro não conhece: é o mesmo "não sei" do
  // cadastro sem data, e a função já responde `cnh_sem_data` para `null`.
  const alerta = alertaDoMotorista(escolhido?.licenseExpiry ?? null, new Date());
  if (!alerta) return null;

  const vencida = alerta === "cnh_vencida";
  return (
    <p
      role={vencida ? "alert" : undefined}
      className={cn("text-xs", vencida ? "font-medium text-destructive" : "text-warning")}
    >
      {alerta === "cnh_vencida"
        ? t("cnhVencida", { data: formatDate(escolhido?.licenseExpiry ?? null) })
        : alerta === "cnh_vencendo"
          ? t("cnhVencendo", { data: formatDate(escolhido?.licenseExpiry ?? null) })
          : t("cnhSemData")}
    </p>
  );
}

/**
 * O CAMINHÃO NA ESTRADA — a espera da atribuição (2026-08-28, escolhido entre seis opções).
 *
 * ── DUAS PEÇAS, E A SEGUNDA É QUE FAZ FUNCIONAR ───────────────────────────────────────────────
 *
 * O caminhão vai e volta num trecho curto; o asfalto embaixo corre em sentido contrário, sem
 * parar. Sozinho, o caminhão pareceria hesitar — vai, volta, vai. É o traço do chão que dá a
 * direção e transforma o movimento em "está indo".
 *
 * ── ÍCONE, E NÃO EMOJI ────────────────────────────────────────────────────────────────────────
 *
 * O rascunho que o usuário escolheu usava um emoji de caminhão, que é mais rápido de escrever e
 * muda de desenho em cada sistema: no Windows é uma coisa, no Android é outra, e num navegador sem
 * a fonte vira um quadrado. O `Truck` do lucide é o mesmo traço dos outros ícones do TMS e herda a
 * cor por `currentColor`.
 *
 * ── E QUEM DESLIGOU ANIMAÇÃO VÊ O CAMINHÃO PARADO NA PISTA ────────────────────────────────────
 *
 * Não some. A cena continua desenhada, junto do texto que diz o que está acontecendo. Sumir seria
 * tirar a única marca visual de que a tela está ocupada de quem já tem menos pistas, não mais.
 */
/**
 * A CONFIRMAÇÃO: o caminhão sai da cena e o ✓ se desenha (2026-08-29, a pedido).
 *
 * Ocupa o MESMO espaço do `CaminhaoNaEstrada` — mesma altura e largura — para a caixa não pular
 * quando uma cena vira a outra. Um salto de layout no instante da boa notícia faria a pessoa
 * perder justamente o que ela precisava ver.
 *
 * O caminhão continua ali por um terço de segundo, saindo pela direita: é o que liga as duas cenas
 * numa só. Sem ele, o ✓ apareceria do nada e leria como outro componente, não como desfecho.
 *
 * As animações moram no CSS porque uma delas anima `stroke-dashoffset` — ver `globals.css`.
 */
function ConfirmadoNoPortal() {
  return (
    // `relative` é obrigatório: o caminhão é `absolute`, e sem um pai posicionado ele se ancoraria
    // na cobertura `fixed inset-0` — saindo do meio da caixa para o canto da tela, no exato
    // instante em que a pessoa está olhando para a confirmação.
    <div className="relative flex h-10 w-24 items-center justify-center" aria-hidden>
      <Truck className="absolute h-6 w-6 text-primary animate-caminhao-sai" />
      <svg viewBox="0 0 52 52" className="h-10 w-10 animate-selo-entra">
        <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3" className="text-success/30" />
        <path
          d="M15 27 l8 8 l15 -16"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-success animate-visto-desenha"
        />
      </svg>
    </div>
  );
}

function CaminhaoNaEstrada() {
  return (
    <div className="flex h-10 w-24 flex-col items-center justify-center gap-1.5" aria-hidden>
      <Truck className="h-6 w-6 text-primary animate-caminhao-anda motion-reduce:animate-none" />
      {/* A pista: o tracejado mora no CSS porque o que se anima nele é `background-position`. */}
      <span className="h-[3px] w-full rounded-full animate-caminhao-pista motion-reduce:animate-none" />
    </div>
  );
}
