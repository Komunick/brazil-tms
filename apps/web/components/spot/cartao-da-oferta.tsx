"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Minus, TriangleAlert } from "lucide-react";
import type { SpotOfferView } from "@brazil-tms/db";

/**
 * UM CARTÃO DE OFERTA DE SPOT, nas cores do cliente (2026-09-01, fatia 030).
 *
 * Ele saiu de dentro de `oferta-de-spot.tsx` quando o cartão parou de ser um por vez: com vários na
 * tela ao mesmo tempo, cada um precisa do próprio estado de confirmação.
 *
 * ── POR QUE AS CORES DA SHOPEE, E NÃO AS NOSSAS ───────────────────────────────────────────────
 *
 * O cartão nasceu no azul-marinho da Brazil Transports, e a troca foi pedida em 01/09. A razão é
 * boa e vale ficar escrita: este cartão sobe na tela de quem opera TRÊS frentes, e o que ele
 * precisa dizer antes de qualquer palavra é DE QUEM é a oferta. Cor de cliente responde isso à
 * distância; a nossa não responde nada — todo o TMS já é nosso.
 *
 * ── O LARANJA DIZ DE QUEM É; O VERMELHO DIZ CORRE ─────────────────────────────────────────────
 *
 * São duas informações diferentes, e por isso o alerta NÃO é um tom de laranja. Cor de marca e cor
 * de alarme parentes fazem o alarme parar de alarmar — o olho passa a ler os dois como a mesma
 * coisa, e a urgência vira decoração.
 *
 * ── O PISCAR TEM PRAZO, E O PRAZO É MEDIDO ────────────────────────────────────────────────────
 *
 * O cartão FICA na tela até alguém decidir. Piscar por trinta segundos é ênfase; piscar por duas
 * horas numa sexta cheia é o que faz a sala pedir para desligar o aviso — e um aviso desligado não
 * avisa mais nada.
 *
 * Então ele acalma sozinho depois de `MINUTOS_PISCANDO`, deixando só a cor da marca. O número não
 * foi inventado: medido em produção em 01/09, os onze aceites de LH vinda de oferta de spot foram
 * disparados de ZERO A TRÊS MINUTOS depois de a oferta chegar. O alarme cobre exatamente a janela
 * em que a operação de fato decide, e se cala quando ela passa.
 */

/** Ver o comentário acima: é a janela medida em que a decisão acontece, não um número escolhido. */
const MINUTOS_PISCANDO = 3;

const MARCA = {
  laranja: "#EE4D2D",
  laranjaEscuro: "#D73211",
  laranjaClaro: "#FF6B45",
  alerta: "#E02020",
};

/**
 * A TRADUÇÃO DE UM CÓDIGO SÓ, e a regra que impede o catálogo de envelhecer (2026-09-01).
 *
 * Medido em produção: as 4 recusas de aceite que existem são TODAS `131205003`. Ele responde por
 * 100% dos casos vistos, e significa "essa LH não está mais esperando decisão" — ou porque alguém
 * já a pegou (a corrida do leilão), ou porque ela já era nossa e a tentativa foi repetida.
 *
 * CÓDIGO DESCONHECIDO MOSTRA O TEXTO CRU DO PORTAL, nunca "erro desconhecido". É essa regra que
 * mantém o mapa honesto: ele explica o que já entendemos e sai da frente do que ainda não. Um
 * fallback genérico apagaria a única pista do caso novo, e mandaria a pessoa abrir o portal para
 * descobrir — que é o passo que esta fatia existe para eliminar.
 */
const EXPLICACAO_DO_PORTAL: Record<string, string> = {
  "131205003": "A viagem não está mais esperando decisão — ela pode já ter sido aceita.",
};

function explicar(erro: string | null): { frase: string | null; cru: string } | null {
  if (!erro) return null;
  const codigo = /(\d{6,})/.exec(erro)?.[1] ?? "";
  return { frase: EXPLICACAO_DO_PORTAL[codigo] ?? null, cru: erro };
}

/**
 * O logo do cliente em VETOR, e não o arquivo que veio.
 *
 * O PNG recebido tinha 48 px — suficiente para o tamanho do cartão e insuficiente para a TV da
 * sala, e esta tela vai aos dois. Como a sacola é uma forma simples, ela é desenhada aqui: fica
 * nítida em qualquer tamanho e não custa uma requisição.
 *
 * "Aumentar a resolução" de um raster não existe — não há detalhe a recuperar. O que existe é
 * trocar por vetor quando a forma permite. O mascote não permite (é desenho com sombreado), e por
 * isso continua sendo o arquivo, limitado ao tamanho dele.
 */
function LogoDoCliente({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="11" fill="#fff" />
      <path
        d="M18 15a6 6 0 0 1 12 0"
        fill="none"
        stroke={MARCA.laranja}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M11.5 16.5h25l-2 20a3.5 3.5 0 0 1-3.5 3.2H17a3.5 3.5 0 0 1-3.5-3.2l-2-20z"
        fill={MARCA.laranja}
      />
      <path
        d="M27.4 24.6c-1-.9-2.2-1.3-3.6-1.3-2.2 0-3.7 1.1-3.7 2.8 0 1.6 1.2 2.4 3.4 3 2 .5 2.6.9 2.6 1.7 0 .9-.8 1.4-2.1 1.4-1.3 0-2.5-.5-3.5-1.4"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface CartaoDaOfertaProps {
  oferta: SpotOfferView;
  /** Só quem pode aceitar viagem no portal vê o botão. Falso ⇒ o cartão é só informação. */
  podeDecidir: boolean;
  /** Está enviando a ordem AGORA (entre o clique e a resposta). Trava o botão. */
  enviando: boolean;
  onAceitar: () => void;
  onIgnorar: (motivo: string | null) => void;
  /**
   * AVISA A ESTEIRA que este cartão está com uma pergunta aberta (2026-09-01).
   *
   * Sem isto, quem aperta Aceitar e afasta o mouse para ler a confirmação vê o cartão deslizar
   * embaixo dela, levando a pergunta junto. O mouse em cima já pausa a faixa; este aviso cobre o
   * caso em que a mão sai e a decisão continua aberta.
   */
  aoOcuparse?: (ocupado: boolean) => void;
  /** Compacto quando há vários na tela: mesma informação, menos respiro. */
  compacto: boolean;
}

export function CartaoDaOferta({
  oferta,
  podeDecidir,
  enviando,
  onAceitar,
  onIgnorar,
  aoOcuparse,
  compacto,
}: CartaoDaOfertaProps) {
  const t = useTranslations("Spot");

  /**
   * A CONFIRMAÇÃO VIVE NO CARTÃO, e é por isso que ela é estado local.
   *
   * O aceite não tem volta: o primeiro clique só ABRE a pergunta, com o número da LH escrito, e o
   * segundo é que manda. Local, e não no componente de cima: com vários cartões, um estado
   * compartilhado faria confirmar um e ver a pergunta aparecer em todos.
   */
  const [confirmando, setConfirmando] = useState(false);
  /** O segundo gesto do Ignorar, e o que a pessoa escreveu nele. Ver o bloco lá embaixo. */
  const [ignorando, setIgnorando] = useState(false);
  const [motivo, setMotivo] = useState("");

  /*
    UM ÚNICO PONTO avisa a esteira, em vez de cada botão avisar por conta.

    Dois pontos contariam diferente no primeiro caminho que alguém esquecesse de fechar — e um
    contador que nunca chega a zero deixa a faixa parada para sempre, que é pior do que ela andar.
    A limpeza no `return` cobre o cartão que sai da tela com a pergunta aberta.
  */
  const ocupado = confirmando || ignorando;
  useEffect(() => {
    aoOcuparse?.(ocupado);
    return () => aoOcuparse?.(false);
  }, [ocupado, aoOcuparse]);

  const erro = explicar(oferta.erroDoPortal);

  /**
   * ALARMA ENQUANTO É NOVA, e só. Ver `MINUTOS_PISCANDO`.
   *
   * Não há temporizador aqui: a busca das ofertas roda de cinco em cinco segundos e redesenha o
   * cartão, então a virada acontece sozinha, com no máximo cinco segundos de atraso. Um `setTimeout`
   * próprio seria um segundo relógio para manter em dia — e um relógio a mais é um lugar a mais
   * onde o cartão pode ficar preso no estado errado.
   */
  const idadeEmMinutos = (Date.now() - new Date(oferta.receivedAt).getTime()) / 60_000;
  const alarmando = oferta.estado !== "enviado" && idadeEmMinutos < MINUTOS_PISCANDO;

  return (
    <div
      className={`pointer-events-auto flex w-full overflow-hidden rounded-[18px] bg-card shadow-[0_1px_2px_rgba(16,24,40,0.06),0_18px_44px_-20px_rgba(0,0,0,0.45)] ${
        alarmando ? "animate-oferta-alarme" : ""
      }`}
      /*
        BORDA DE 1px, e não de 3 (2026-09-02, a pedido).

        Três pixels vinham da época em que a borda era o alarme inteiro. O piscar continua — ele
        agora troca a COR e uma sombra fina —, e a espessura só engrossava o desenho.
      */
      style={{ border: `1px solid ${MARCA.laranja}` }}
      data-oferta={oferta.id}
      data-estado={oferta.estado}
    >
      {/*
        A ARTE DA CAMPANHA, INTEIRA (2026-09-02, a pedido).

        `object-contain` e não `cover`: numa tira alta e estreita o `cover` recorta, e recorta
        justamente por baixo — sumia o "SPOT NA TELA", que é o nome da coisa.

        O fundo é o degradê das BORDAS da própria imagem, medido pixel a pixel (topo #f84401, base
        #d73802). É ele que faz a sobra em cima e embaixo continuar sendo a arte, em vez de virar uma
        faixa de cor diferente. TROCAR A IMAGEM OBRIGA A REFAZER ESSA MEDIDA — senão aparece a emenda.
      */}
      <div
        className={`relative shrink-0 self-stretch overflow-hidden ${compacto ? "w-[112px]" : "w-[168px]"}`}
        style={{ background: "linear-gradient(#f84401, #d73802)" }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- estático em /public, já no tamanho */}
        <img
          src="/clientes/spot-na-tela.webp"
          alt=""
          className="h-full w-full object-contain object-center"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── A FAIXA DO CLIENTE ─────────────────────────────────────────────────────────────── */}
        <div
          className={`flex items-center justify-between gap-3 ${compacto ? "px-4 py-2.5" : "px-5 py-3"}`}
          style={{
            background: `linear-gradient(135deg, ${MARCA.laranjaClaro} 0%, ${MARCA.laranja} 45%, ${MARCA.laranjaEscuro} 100%)`,
          }}
        >
          <span className="flex min-w-0 flex-col leading-none text-white">
            {/*
            A ORDEM IMPORTA: primeiro O QUE É (spot na tela), depois DE QUEM (o cliente). Quem opera
            três frentes reconhece a origem pela cor antes de ler — e a palavra confirma.
          */}
            <span
              className={`font-black uppercase tracking-[0.16em] ${compacto ? "text-[0.8rem]" : "text-base"}`}
            >
              {t("spotNaTela")}
            </span>
            <span
              className={`mt-1 flex items-center font-bold text-white/75 ${compacto ? "text-[0.72rem]" : "text-sm"}`}
            >
              {/*
              O NOME DO CLIENTE VEM DE UM RÓTULO, e não fixo no JSX — o lint pegou, e ele tem razão
              por um motivo maior que a regra dele.

              Hoje TODA oferta de spot é da Shopee: o monitor que as detecta roda numa aba do portal
              DELA, e de mais nenhum. Então o nome é constante de fato, e a marca no cartão está
              certa. Mas o TMS atende três clientes, e no dia em que outro abrir leilão este cartão
              passaria a mentir em silêncio — dizendo Shopee sobre uma oferta que não é.

              Quando isso acontecer, o conserto é a oferta CARREGAR o cliente (`spot_offers` não tem
              essa coluna hoje) e este bloco lê dela. Fica escrito para não ser descoberto na tela.
            */}
              <LogoDoCliente className={compacto ? "mr-1.5 h-4 w-4" : "mr-2 h-5 w-5"} />
              {t("clienteDoSpot")}
            </span>
          </span>

          {/*
        {/*
          O MASCOTE DA SHOPEE, na DIREITA da faixa (2026-09-02, a pedido).

          Ele ficava grande, do outro lado, com uma bandeirinha nossa saindo por trás. Com a arte da
          campanha ocupando a lateral, os dois desenhos passaram a disputar o mesmo canto — o mascote
          cobria o celular e parte do rosto. A bandeira saiu junto: era um enfeite a mais competindo
          com uma peça que já tem movimento próprio.

          Aqui ele é um selo: a faixa cresce um pouco, ele desce alguns pixels para fora do laranja,
          e nada mais briga com ele.
        */}
          {/* eslint-disable-next-line @next/next/no-img-element -- estático em /public; 8 KB, já no tamanho */}
          <img
            src="/clientes/shopee-mascote.webp"
            alt=""
            width={46}
            height={46}
            className={`relative z-[1] -my-2 shrink-0 rounded-full border-2 border-white bg-white object-cover shadow-[0_4px_12px_-4px_rgba(0,0,0,0.45)] ${
              compacto ? "h-9 w-9" : "h-[46px] w-[46px]"
            } ${alarmando ? "animate-oferta-mascote" : ""}`}
          />
        </div>

        {/*
        ── A DECISÃO TOMA O CARTÃO POR DEZ SEGUNDOS (2026-09-02, a pedido) ──────────────────────

        Nas palavras do usuário: "agora você aperta ignorar e só some". Quem clicava via sumir; para
        o resto da equipe o cartão simplesmente desaparecia, sem dizer se alguém decidiu, quem foi,
        ou se o sistema falhou.

        O aviso SUBSTITUI o corpo em vez de aparecer junto: o cartão já não tem mais o que perguntar,
        e manter os botões ao lado de "fulano ignorou" convidaria a clicar no que já foi decidido.

        Quem controla o tempo é o SERVIDOR — a oferta some quando a leitura para de trazê-la. Aqui
        não há temporizador que remova nada: só a barra, que é a mesma janela desenhada.
      */}
        {oferta.decisao ? (
          <AvisoDaDecisao decisao={oferta.decisao} lh={oferta.tripNumber} compacto={compacto} />
        ) : (
          <div className={`flex flex-col ${compacto ? "gap-2.5 px-4 py-3.5" : "gap-3 px-5 py-4"}`}>
            {oferta.tripNumber ? (
              <span
                className={`self-start rounded-lg px-2.5 py-1 font-black tracking-[0.1em] tabular-nums ${
                  compacto ? "text-[0.84rem]" : "text-base"
                }`}
                style={{ background: "rgba(238,77,45,0.12)", color: MARCA.laranjaEscuro }}
              >
                {oferta.tripNumber}
              </span>
            ) : null}

            {/*
          A ROTA EM UMA LINHA SÓ, e a letra encolhe conforme ela cresce. Quebrada, ela parte no meio
          do nome da estação ("LM Hub_PB_João / Pessoa_Gramame") e o olho para para remontar a
          palavra — e é ela que decide se alguém corre atrás do frete.

          ── E ELA ESTAVA SENDO CORTADA (2026-09-04, a pedido) ──────────────────────────────────

          Medido nas 179 ofertas gravadas: a maior rota tem 65 caracteres
          ("SoC_PE_Jaboatão dos Guararapes -> LM Hub_PB_João Pessoa_Gramame"), o p95 tem 61, a média
          44. Com o cartão a 560px e a faixa da arte ocupando 168, sobravam ~360px de texto — e no
          piso da letra (0.85rem) 65 caracteres em negrito pedem perto de 490. O fim da rota sumia,
          sem reticências e sem aviso: o destino, que é metade da decisão, simplesmente não estava lá.

          O cartão foi para 760px. O piso desceu para 0.78rem como rede: se um dia aparecer rota
          maior que as 179 medidas, ela encolhe mais em vez de ser cortada. `title` continua com o
          texto inteiro, que é o que salva o caso extremo.
        */}
            <div
              className="w-full overflow-hidden whitespace-nowrap font-extrabold leading-tight"
              style={{
                fontSize: compacto
                  ? `clamp(0.7rem, ${(60 / Math.max(oferta.route.length, 1)).toFixed(2)}vw, 1rem)`
                  : `clamp(0.78rem, ${(150 / Math.max(oferta.route.length, 1)).toFixed(2)}vw, 1.35rem)`,
              }}
              title={oferta.route}
            >
              {oferta.route}
            </div>

            {/*
          O PREÇO SAIU (a pedido, 01/09) — e é a segunda vez que ele sai deste cartão.
          A maioria das ofertas chega como "preço não exibido", e um campo que quase sempre não diz
          nada rouba o lugar do que decide. O que decide é a rota e o STA da origem.
        */}
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {oferta.originArrival ? (
                <Dado
                  rotulo={t("originArrival")}
                  valor={oferta.originArrival}
                  compacto={compacto}
                />
              ) : null}
              {oferta.vehicle ? (
                <Dado rotulo={t("vehicle")} valor={oferta.vehicle} compacto={compacto} />
              ) : null}
            </div>

            {/* ── O QUE MUDA COM O ESTADO ───────────────────────────────────────────────────────── */}

            {oferta.estado === "enviado" ? (
              <div
                className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm"
                style={{ background: "rgba(238,77,45,0.1)", borderColor: "rgba(238,77,45,0.4)" }}
              >
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin"
                  style={{ color: MARCA.laranja }}
                />
                <span className="leading-snug">
                  {t("aguardandoPortal")}
                  {oferta.decidiuNome ? (
                    <span className="block text-xs text-muted-foreground">
                      {t("aceitoPor", { nome: oferta.decidiuNome })}
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}

            {erro && oferta.estado === "recusado" ? (
              <div
                className="flex w-full flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left"
                style={{ background: "rgba(224,32,32,0.1)", borderColor: "rgba(224,32,32,0.45)" }}
              >
                <span
                  className="flex items-center gap-2 text-sm font-extrabold"
                  style={{ color: MARCA.alerta }}
                >
                  <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
                  {t("portalRecusou")}
                </span>
                {/* A frase nossa quando existe; o texto do portal SEMPRE. Ver `EXPLICACAO_DO_PORTAL`. */}
                {erro.frase ? <span className="text-xs leading-snug">{erro.frase}</span> : null}
                <span className="break-words text-[0.68rem] leading-snug text-muted-foreground">
                  {erro.cru}
                </span>
              </div>
            ) : null}

            {oferta.estado === "sem_viagem" ? (
              <p
                className="w-full rounded-lg px-2.5 py-1.5 text-xs leading-snug"
                style={{ background: "rgba(238,77,45,0.09)", color: MARCA.laranjaEscuro }}
              >
                {t("semViagemAinda")}
              </p>
            ) : null}

            {/* ── OS GESTOS ─────────────────────────────────────────────────────────────────────── */}

            {podeDecidir && confirmando ? (
              <div
                className="flex w-full flex-col gap-2.5 rounded-xl border p-3"
                style={{ background: "rgba(238,77,45,0.09)", borderColor: "rgba(238,77,45,0.45)" }}
              >
                <p className="m-0 text-sm leading-snug">
                  {t.rich("confirmarAceite", {
                    lh: oferta.tripNumber ?? "",
                    forte: (c) => <strong style={{ color: MARCA.laranjaEscuro }}>{c}</strong>,
                  })}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => {
                      setConfirmando(false);
                      onAceitar();
                    }}
                    className="flex-1 rounded-lg px-4 py-2 text-sm font-extrabold text-white disabled:opacity-60"
                    style={{ background: MARCA.laranja }}
                  >
                    {enviando ? t("enviando") : t("confirmarBotao")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(false)}
                    className="rounded-lg border px-4 py-2 text-sm font-semibold text-muted-foreground"
                  >
                    {t("voltar")}
                  </button>
                </div>
              </div>
            ) : null}

            {/*
          IGNORAR TAMBÉM PEDE CONFIRMAÇÃO, e aceita um MOTIVO — opcional (2026-09-01).

          Ele passou a tirar a oferta da tela de todos, então virou uma decisão como o aceite: um
          clique não pode bastar. E o motivo é o que responde, depois, "por que não pegamos aquela?".

          OPCIONAL DE PROPÓSITO: obrigar a escrever faria a operação digitar "n" para se livrar do
          campo, e um registro cheio de "n" é pior que um vazio — parece informação, e ninguém
          desconfia dele. Em branco, o registro ainda guarda quem e quando.
        */}
            {podeDecidir && ignorando ? (
              <div className="flex w-full flex-col gap-2.5 rounded-xl border bg-muted/40 p-3">
                <p className="m-0 text-sm leading-snug">
                  {t.rich("confirmarIgnorar", {
                    lh: oferta.tripNumber ?? "",
                    forte: (c) => <strong>{c}</strong>,
                  })}
                </p>
                <label className="text-[0.62rem] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
                  {t("motivoOpcional")}
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={200}
                  rows={2}
                  placeholder={t("motivoExemplo")}
                  className="w-full resize-y rounded-lg border bg-background p-2 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => {
                      setIgnorando(false);
                      onIgnorar(motivo.trim() || null);
                    }}
                    className="flex-1 rounded-lg bg-muted-foreground px-4 py-2 text-sm font-extrabold text-background disabled:opacity-60"
                  >
                    {t("ignorar")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIgnorando(false)}
                    className="rounded-lg border px-4 py-2 text-sm font-semibold text-muted-foreground"
                  >
                    {t("voltar")}
                  </button>
                </div>
              </div>
            ) : null}

            {/*
          OS DOIS BOTÕES APARECEM PARA TODO MUNDO, travados para quem não tem `decidir_spot`.

          Decisão do usuário (01/09), e ela tem um ganho concreto sobre escondê-los: quem não decide
          passa a SABER que a decisão existe. O botão cinza com o motivo escrito ensina a quem pedir
          — escondido, a operação acharia que o cartão é só aviso, que era o problema antes desta
          fatia. Recolher continua funcionando para todos.
        */}
            {!confirmando && !ignorando ? (
              <div className="flex w-full gap-2.5">
                <button
                  type="button"
                  disabled={!podeDecidir || !oferta.podeAceitar || enviando}
                  onClick={() => setConfirmando(true)}
                  title={
                    !podeDecidir
                      ? t("semPermissaoDeDecidir")
                      : oferta.podeAceitar
                        ? undefined
                        : t("aceiteIndisponivel")
                  }
                  className="flex-1 rounded-xl px-4 py-3 text-sm font-extrabold text-white transition-colors disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  style={
                    podeDecidir && oferta.podeAceitar ? { background: MARCA.laranja } : undefined
                  }
                >
                  {oferta.estado === "recusado" ? t("tentarDeNovo") : t("aceitar")}
                </button>
                <button
                  type="button"
                  disabled={!podeDecidir}
                  onClick={() => setIgnorando(true)}
                  title={podeDecidir ? undefined : t("semPermissaoDeDecidir")}
                  className="rounded-xl border-[1.5px] px-5 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("ignorar")}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * QUEM DECIDIU, e a contagem até a oferta sair (2026-09-02, a pedido).
 *
 * ── POR QUE A BARRA É UMA ANIMAÇÃO, e não um número recalculado ───────────────────────────────
 *
 * A primeira versão do desenho recalculava a largura a cada segundo: dez saltos, e um relógio a mais
 * para manter em dia. Aqui é uma animação de `scaleX` de dez segundos, linear — ela escoa lisa,
 * roda fora da linha principal e não precisa de nenhum estado.
 *
 * Ela é ILUSTRAÇÃO, não autoridade: quem tira a oferta da tela é o servidor, quando a leitura para
 * de trazê-la. Se a barra e a leitura discordarem por meio segundo, o que vale é a leitura.
 *
 * ── O ACEITE TAMBÉM ESPERA OS DEZ SEGUNDOS ───────────────────────────────────────────────────
 *
 * A resposta do portal chega em 3 s na mediana. Sem a janela, o aviso do aceite sairia antes de
 * alguém conseguir lê-lo — e é o aviso que mais importa, porque aceitar não tem volta.
 */
function AvisoDaDecisao({
  decisao,
  lh,
  compacto,
}: {
  decisao: NonNullable<SpotOfferView["decisao"]>;
  lh: string | null;
  compacto: boolean;
}) {
  const t = useTranslations("Spot");
  const aceito = decisao.tipo === "aceito";

  return (
    <div className="flex flex-col">
      <div className={`flex items-center gap-3 ${compacto ? "px-4 py-3.5" : "px-5 py-4"}`}>
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white"
          style={{ background: aceito ? "#12925A" : "#6B7280" }}
          aria-hidden
        >
          {aceito ? <Check className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-extrabold leading-tight">
            {/*
              SEM NOME, SEM MENTIRA. A aceitação feita direto no portal chega ao TMS pela leitura do
              plano, e não há a quem creditar — a frase então diz só o que aconteceu.
            */}
            {decisao.porNome
              ? t(aceito ? "aceitoPorAlguem" : "ignoradoPorAlguem", { nome: decisao.porNome })
              : t(aceito ? "aceitoSemNome" : "ignoradoSemNome")}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {lh ? `${lh} · ` : ""}
            {decisao.motivo ? decisao.motivo : t(aceito ? "esperandoPortal" : "naoVamosPegar")}
          </span>
        </span>
      </div>

      <span className="block h-[3px] w-full bg-muted" aria-hidden>
        <span
          className="block h-full w-full origin-left animate-oferta-escoar"
          style={{ background: aceito ? "#12925A" : "#6B7280" }}
        />
      </span>
    </div>
  );
}

function Dado({ rotulo, valor, compacto }: { rotulo: string; valor: string; compacto: boolean }) {
  return (
    <span className="rounded-lg bg-muted px-2.5 py-1.5 leading-tight">
      <span className="block text-[0.6rem] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">
        {rotulo}
      </span>
      <span className={`font-bold tabular-nums ${compacto ? "text-[0.8rem]" : "text-[0.92rem]"}`}>
        {valor}
      </span>
    </span>
  );
}
