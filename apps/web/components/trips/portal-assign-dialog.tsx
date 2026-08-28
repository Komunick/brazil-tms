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
import { MelhoresDaRota } from "@/components/trips/melhores-da-rota";
import {
  TripsError,
  useOrdensDoPortal,
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
  const ordens = useOrdensDoPortal(tripId, aguardando !== null);
  const ordem = ordens.data?.items?.find((o) => o.id === aguardando) ?? null;
  const emVoo = acao.isPending || aguardando !== null;

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
   * O clique numa placa sugerida vai para o PRIMEIRO CAMPO VAZIO.
   *
   * Sobrescrever o campo 1 seria pior: quem já digitou o cavalo e clica numa sugestao esta querendo
   * a CARRETA, e perderia o que acabou de escrever. Se nao houver campo vazio, a sugestao nao faz
   * nada visivel — e isso e melhor que apagar algo em silencio.
   *
   * Placa repetida e ignorada: o portal recusaria o par duplicado, e recusar aqui poupa uma ordem.
   */
  const preencherPrimeiroVazio = (nova: string) => {
    setPlacas((atual) => {
      if (atual.some((p) => normalizarPlaca(p) === normalizarPlaca(nova))) return atual;
      const vazio = atual.findIndex((p) => normalizarPlaca(p) === "");
      if (vazio < 0) return atual;
      return atual.map((p, i) => (i === vazio ? normalizarPlaca(nova) : p));
    });
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
      onSent?.();
      onOpenChange(false);
    } else if (ordem.status === "failed") {
      setAguardando(null);
    }
  }, [ordem, onSent, onOpenChange]);

  /*
   * O erro pode vir de DOIS lugares, e os dois precisam aparecer no mesmo canto: a recusa do
   * servidor ao enfileirar (regra nossa) e a recusa do portal ao executar (regra deles).
   */
  const erroDoServidor =
    (acao.error instanceof TripsError ? acao.error.message : null) ??
    (ordem?.status === "failed" ? (ordem.lastError ?? t("falhouSemMotivo")) : null);

  return (
    /*
      FECHAR FICA BLOQUEADO ENQUANTO A ORDEM ESTÁ EM VOO (2026-08-28, a pedido).

      O `onOpenChange` do Dialog dispara no Esc, no clique fora e no X. Passá-lo direto deixava a
      pessoa fechar no meio do envio — e aí a ordem seguia sem ninguém para ver o desfecho, que é
      exatamente o silêncio que este trabalho veio desfazer.

      Só o FECHAR é barrado. Abrir continua livre, e o efeito do desfecho fecha normalmente.
    */
    <Dialog open={open} onOpenChange={(v) => (emVoo && !v ? undefined : onOpenChange(v))}>
      <DialogContent className="relative max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        {/**
          A COBERTURA DE CARREGAMENTO (2026-08-28, a pedido).

          Era um texto no rodapé, e o pedido foi um popup no meio — para a pessoa não fechar sem
          querer. Aqui ele é uma camada SOBRE o formulário, e não outro diálogo: um segundo modal em
          cima do primeiro empilha duas camadas de foco, e o leitor de tela passa a anunciar duas
          janelas para uma coisa só.

          `absolute inset-0` cobre o conteúdo inteiro, então nada embaixo recebe clique — a proteção
          é física, não só visual. `sticky` no cartão o mantém no meio mesmo com o formulário rolado.

          `aria-live="assertive"` porque isto interrompe o que a pessoa estava fazendo: ela precisa
          ouvir, não descobrir depois.
        */}
        {emVoo ? (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-[2px]"
            role="status"
            aria-live="assertive"
          >
            <div className="sticky top-1/2 flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-6 shadow-lg">
              <CaminhaoNaEstrada />
              <p className="text-sm font-medium">{t("efetuando")}</p>
              <p className="max-w-[22rem] text-center text-xs text-muted-foreground">
                {t("efetuandoDica")}
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
                <VinculoDoRecurso
                  rotulo={t("driver")}
                  valor={doMotorista ?? vinculoMotorista}
                  jaClassificado={doMotorista != null}
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
                  valor={doSegundo ?? vinculoSegundo}
                  jaClassificado={doSegundo != null}
                  aoEscolher={setVinculoSegundo}
                />
              ) : null}
            </div>

            {/*
              AS PLACAS QUE ESTE MOTORISTA JÁ RODOU — logo acima dos campos (2026-08-27, a pedido).

              A posição é a mensagem: ela aparece DEPOIS de escolher o motorista e ANTES de mexer na
              placa, que é exatamente a ordem em que a dúvida acontece. Embaixo dos campos seria uma
              resposta chegando tarde; ao lado, num diálogo estreito, empurraria os campos.

              O clique preenche o PRIMEIRO campo vazio — ver `preencherPrimeiroVazio`.
            */}
            <PlacasDoMotorista driverId={driverId} aoEscolher={preencherPrimeiroVazio} />

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
                    valor={jaClassificados[normalizarPlaca(placa)] ?? vinculoDasPlacas[i] ?? null}
                    jaClassificado={jaClassificados[normalizarPlaca(placa)] != null}
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

            {placas.length < 2 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPlacas((a) => [...a, ""])}
              >
                {t("addPlate")}
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
                   * Só o que ESTA tela escolheu. O que já estava classificado não é reenviado: a
                   * gravação ignoraria de qualquer jeito (ela só preenche vazio), e mandar de volta
                   * o valor lido daria a impressão de que a tela pode sobrescrever o cadastro.
                   */
                  vinculos: {
                    placas: preenchidas.map((p, i) =>
                      jaClassificados[p] != null ? null : (vinculoDasPlacas[i] ?? null),
                    ),
                    motorista: doMotorista != null ? null : vinculoMotorista,
                    segundoMotorista: doSegundo != null ? null : vinculoSegundo,
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
function CaminhaoNaEstrada() {
  return (
    <div className="flex h-10 w-24 flex-col items-center justify-center gap-1.5" aria-hidden>
      <Truck className="h-6 w-6 text-primary animate-caminhao-anda motion-reduce:animate-none" />
      {/* A pista: o tracejado mora no CSS porque o que se anima nele é `background-position`. */}
      <span className="h-[3px] w-full rounded-full animate-caminhao-pista motion-reduce:animate-none" />
    </div>
  );
}
