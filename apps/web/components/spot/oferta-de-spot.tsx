"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Gavel, X } from "lucide-react";
import type { SpotOfferView } from "@brazil-tms/db";
import { useSpotOffers } from "@/lib/trips/client";
import { decidirAviso, estadoInicial, novasOfertas } from "@/lib/spot/ofertas";
import { tocarAviso } from "@/lib/spot/som";

/**
 * O AVISO DE OFERTA no meio da tela (2026-08-18).
 *
 * O leilão de spot tem prazo curto: quem vê primeiro dá lance. O aviso já existia no Telegram, no
 * celular de quem estava olhando; este é o mesmo aviso na tela de quem está trabalhando.
 *
 * Três decisões vêm de a tela ficar ligada o dia inteiro, às vezes sem ninguém tocando nela:
 *
 *   MÉDIO, NÃO TELA CHEIA. Cobre o centro e deixa o painel respirando em volta. Uma cortina cheia
 *   faria a sala pedir para desligar o aviso, e aí ele não avisa mais nada.
 *
 *   SAI SOZINHO EM 30 SEGUNDOS. O botão de fechar é atalho para quem está na frente do computador,
 *   não condição: numa TV ninguém clica, e aviso que depende de clique vira cortina permanente no
 *   primeiro dia em que a sala esvazia.
 *
 *   UM DE CADA VEZ, EM FILA. Chegando três no mesmo ciclo, empilhá-las esconderia duas.
 */

/** Quanto tempo cada aviso fica na tela. */
const DURACAO_MS = 30_000;

/**
 * AS CORES DA MARCA, e por que cada uma está onde está (2026-08-19, a pedido).
 *
 * O logo da Brazil Transports tem três: verde escuro (o dominante), amarelo e azul-marinho. São as
 * da bandeira, e o pedido veio com uma condição — "de uma forma que não atrapalhe a visualização".
 * Ela é o que decide a distribuição abaixo, porque as três juntas erram fácil.
 *
 *   FUNDO AZUL-MARINHO, não verde. Verde é a cor dominante do logo, e um fundo verde escuro deixa o
 *   texto branco com contraste pior e o amarelo quase invisível. O marinho é o mais escuro dos três:
 *   serve de base e faz os outros dois aparecerem.
 *
 *   AMARELO SÓ NO QUE É CURTO E GRANDE — o número da viagem e a barra de tempo. Amarelo sobre
 *   marinho tem contraste altíssimo (~11:1), mas em texto pequeno ele vibra e cansa. Rótulo e valor
 *   ficam em cinza-claro e branco.
 *
 *   VERDE NA MOLDURA. É a cor que diz "Brazil Transports" à distância, e na borda ela não compete
 *   com texto nenhum. A faixa de cima faz verde → amarelo, que é a assinatura do logo.
 *
 * O que NÃO mudou: o fundo continua escuro. Numa TV ligada o dia inteiro, cartão claro estoura o
 * brilho da sala e é a primeira coisa que alguém pede para desligar.
 */
const MARCA = {
  fundo: "#0C1A2B",
  fundoTopo: "#12283F",
  verde: "#1B7A3D",
  amarelo: "#F2C230",
  texto: "#EEF3F8",
  rotulo: "#93A9BF",
};

export function OfertaDeSpot() {
  const t = useTranslations("Spot");
  // Busca própria, com ritmo próprio: o componente é montado em telas de cadências diferentes e não
  // pode herdar a lentidão de nenhuma delas. Ver `useSpotOffers`.
  const { data } = useSpotOffers();
  const ofertas = data?.ofertas;

  // A memória de "já anunciei" vive na sessão da tela, não em estado do React: recriá-la a cada
  // render faria a mesma oferta voltar a ser novidade. Ver `novasOfertas`.
  const memoria = useRef(estadoInicial());
  /**
   * QUANDO chegou a última oferta nova — o que separa uma rajada da seguinte.
   *
   * Em `useRef` e não em estado: mudá-la não deve redesenhar nada, e ela precisa sobreviver entre
   * buscas sem virar dependência de efeito. Começa em zero, então a primeira oferta da sessão sempre
   * começa rajada — que é o certo: depois de um recarregamento, a próxima oferta é novidade.
   */
  const ultimaOfertaEm = useRef(0);
  const [fila, setFila] = useState<SpotOfferView[]>([]);
  const [saindo, setSaindo] = useState(false);
  /**
   * Quantas foram para a caixa sem passar pela tela, desde este cartão.
   *
   * Existe para o cartão poder DIZER que absorveu — sem o número, quem viu uma oferta e sabe que a
   * sexta tem cinquenta ficaria desconfiado de estar perdendo as outras. Zera quando o cartão sai:
   * ele conta o que aconteceu enquanto ele estava lá, não o dia inteiro.
   */
  const [absorvidas, setAbsorvidas] = useState(0);

  /**
   * UM AVISO POR RAJADA; o resto vai para a caixa (2026-08-21, a pedido). Ver `decidirAviso`.
   *
   * O SILÊNCIO é medido FORA do `setFila`: ele descreve quando a oferta chegou, e o `setFila` pode ser
   * reexecutado pelo React — recalcular o relógio lá dentro daria uma medida diferente a cada vez.
   *
   * O resto da decisão fica DENTRO dele: é o único lugar onde se sabe, sem correr risco de
   * estado velho, se já existe um cartão na tela. Ler `fila` de fora do `setFila` traria o valor do
   * render anterior — e numa TV que busca a cada poucos segundos, isso erra na hora exata em que
   * mais importa acertar, que é durante a rajada.
   */
  useEffect(() => {
    if (!ofertas) return;
    const novas = novasOfertas(memoria.current, ofertas);
    if (novas.length === 0) return;
    const agora = Date.now();
    const silencio = agora - ultimaOfertaEm.current;
    ultimaOfertaEm.current = agora;
    setFila((atual) => {
      const decisao = decidirAviso(atual.length > 0, novas, silencio);
      if (decisao.absorvidas > 0) setAbsorvidas((n) => n + decisao.absorvidas);
      if (!decisao.anunciar) return atual;
      // O som acompanha o cartão, não a oferta: o que foi para a caixa não faz barulho.
      tocarAviso();
      return [decisao.anunciar];
    });
  }, [ofertas]);

  const atual = fila[0];

  /**
   * A saída passa pela animação antes de tirar da fila.
   *
   * Sem isso, fechar (ou o tempo acabar) faz o cartão SUMIR num quadro — e some junto a informação
   * de que ele estava ali, o que numa tela de canto do olho parece falha de renderização.
   */
  const encerrar = useCallback(() => {
    setSaindo(true);
    setTimeout(() => {
      setSaindo(false);
      setAbsorvidas(0);
      setFila((f) => f.slice(1));
    }, 220);
  }, []);

  useEffect(() => {
    if (!atual) return;
    const t = setTimeout(encerrar, DURACAO_MS);
    return () => clearTimeout(t);
  }, [atual, encerrar]);

  if (!atual) return null;

  return (
    <div
      // A CAMADA é transparente ao mouse; só o cartão recebe clique. Assim o botão de fechar funciona
      // sem que o resto do aviso roube um clique de quem está trabalhando no painel atrás.
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
      role="status"
      aria-live="polite"
    >
      {/**
       * QUADRADO, e com QUATRO informações (2026-08-19, a pedido, sobre um desenho do usuário).
       *
       * Era um retângulo largo com cabeçalho, preço em destaque e contador de fila. Virou um quadrado
       * com viagem, rota, saída e veículo — as mesmas coisas que vão para o Telegram, e só elas.
       *
       * O que saiu, e por quê: o PREÇO, porque a maioria das ofertas chega como "preço não exibido" e
       * um campo que quase sempre diz nada rouba o lugar do que decide; o CABEÇALHO "Nova oferta",
       * porque um aviso que ocupa o meio da tela por trinta segundos já se anuncia sozinho; e o
       * CONTADOR DE FILA, porque a segunda oferta aparece logo em seguida de qualquer jeito.
       *
       * O que ficou, e não é informação: o X (foi pedido antes) e a barra de tempo, que é o que
       * explica por que o aviso some sozinho.
       *
       * LARGO, E COM A ALTURA SEGUINDO O CONTEÚDO (2026-08-19, autorizado).
       *
       * O desenho pedia um quadrado, e ele não sobreviveu a dois pedidos que vieram depois: a rota em
       * UMA linha e nada de espaço vazio. Com 620 px de largura, os 73 caracteres da maior rota
       * espremiam a letra para ~15 px — legível de perto, invisível numa TV do outro lado da sala.
       *
       * A largura resolve a leitura; tirar a proporção fixa resolve o vazio. São só três blocos, e
       * qualquer altura imposta sobraria embaixo deles — que foi exatamente o que aconteceu com o
       * quadrado e com o 3:2 que tentei antes dele.
       *
       * O `py` generoso é o que mantém cara de CARTÃO em vez de barra de notificação: o aviso precisa
       * de peso para fazer alguém virar a cabeça, e peso aqui vem da moldura, não de espaço morto.
       */}
      <div
        style={{
          background: `linear-gradient(160deg, ${MARCA.fundoTopo} 0%, ${MARCA.fundo} 55%)`,
          boxShadow: `0 0 0 9999px rgba(3,10,18,0.62), 0 30px 70px -20px rgba(0,0,0,0.95)`,
          outline: `5px solid ${MARCA.verde}`,
        }}
        className={`pointer-events-auto relative flex max-h-[80vh] w-[74vw] min-w-[360px] max-w-[1500px] flex-col overflow-hidden rounded-[28px] transition-all duration-200 ${
          saindo ? "scale-[0.97] opacity-0" : "scale-100 opacity-100"
        }`}
      >
        {/* A assinatura do logo em 4 px: verde virando amarelo. Não carrega texto, então não há
            contraste a perder — é a única cor que pode ser puramente decorativa aqui. */}
        <div
          aria-hidden
          className="h-1 shrink-0"
          style={{ background: `linear-gradient(90deg, ${MARCA.verde}, ${MARCA.amarelo})` }}
        />

        <button
          type="button"
          onClick={encerrar}
          aria-label={t("dismiss")}
          title={t("dismiss")}
          className="absolute right-3 top-4 z-10 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <div className="flex flex-1 flex-col items-center justify-center gap-[2.2vh] px-[6%] py-[3.5vh] text-center">
          {/* TRIP — o número do LH, para quem for atrás dele no portal. */}
          {atual.tripNumber ? (
            <div className="flex items-center gap-2.5" style={{ color: MARCA.amarelo }}>
              <Gavel className="h-[1.7vw] min-h-5 w-[1.7vw] min-w-5 shrink-0" aria-hidden />
              <span className="font-black uppercase tracking-[0.14em] tabular-nums [font-size:clamp(1rem,1.8vw,2.6rem)]">
                {atual.tripNumber}
              </span>
            </div>
          ) : null}

          {/**
           * ROTA EM UMA LINHA SÓ (2026-08-19, a pedido) — e é por ela que o cartão alargou.
           *
           * Quebrada em duas ou três linhas, a rota quebrava no meio do nome da estação
           * ("LM Hub_PB_João / Pessoa_Gramame"), o que faz o olho parar para remontar a palavra. É a
           * informação que decide se alguém corre atrás do frete; ela não pode custar leitura.
           *
           * O tamanho da letra CAI conforme o texto cresce, em vez de um valor fixo. Medido nas rotas
           * reais: a maior tem 65 caracteres nas ofertas e 73 nas viagens em geral. Com um número
           * fixo, ou a rota longa vazava, ou a curta ficava pequena à toa.
           *
           * A conta de caber: a largura útil é 88% do cartão e uma letra em negrito ocupa ~0,52 do
           * corpo dela, então o corpo máximo é `1,69 × largura ÷ comprimento`.
           *
           * O TETO É EM PIXELS, e isso não é detalhe. O cartão cresce com a tela até 1080 px e PARA;
           * um tamanho só em `vw` continuaria crescendo depois disso e a rota vazaria justamente na
           * tela grande — que é a TV, o lugar onde ela precisa caber.
           */}
          <div
            className="w-full overflow-hidden whitespace-nowrap font-bold leading-tight"
            style={{
              color: MARCA.texto,
              fontSize: `clamp(0.72rem, ${(125 / Math.max(atual.route.length, 1)).toFixed(2)}vw, ${Math.min(54, 2535 / Math.max(atual.route.length, 1)).toFixed(1)}px)`,
            }}
            title={atual.route}
          >
            {atual.route}
          </div>

          {/**
           * UM HORÁRIO SÓ, E COM O NOME DO PORTAL: o STA da ORIGEM (2026-08-19, a pedido).
           *
           * A viagem tem três instantes programados, e eu mostrava os dois errados. Na LT1Q8J02EEL01
           * eles eram:
           *
           *   STA origem   19/08 16:29   o caminhão precisa ESTAR lá   ← este
           *   STD origem   19/08 17:29   ele sai
           *   STA destino  20/08 01:29   chega no destino
           *
           * Só o primeiro responde a pergunta de quem vai dar lance: "consigo pôr um caminhão aí?".
           * Os outros dois são consequência, e numa TV cada campo a mais encolhe todos os outros.
           *
           * O rótulo é `STA` porque é assim que está escrito na coluna do portal. Chamar de "saída"
           * ou "chegada" obriga quem lê os dois lados a traduzir de cabeça — e foi traduzindo de
           * cabeça que esta tela ficou com o horário errado desde que nasceu.
           */}
          {atual.originArrival || atual.vehicle ? (
            <div className="flex w-full items-start justify-center gap-[12%]">
              {atual.originArrival ? (
                <Dado rotulo={t("originArrival")} valor={atual.originArrival} />
              ) : null}
              {atual.vehicle ? <Dado rotulo={t("vehicle")} valor={atual.vehicle} /> : null}
            </div>
          ) : null}

          {/**
           * "+N na caixa" — o que chegou enquanto este cartão estava na tela (2026-08-21).
           *
           * Sem esta linha, o corte seria invisível: quem sabe que a sexta traz cinquenta ofertas e vê
           * uma só na tela conclui que está perdendo as outras, e passa a desconfiar da tela inteira.
           * Com ela, o cartão diz o que fez — e diz onde as outras estão.
           *
           * Só aparece quando houve absorção. Num dia normal ninguém vê esta linha.
           */}
          {absorvidas > 0 ? (
            <p className="text-center text-[0.8rem] font-medium" style={{ color: MARCA.amarelo }}>
              {t("absorbed", { count: absorvidas })}
            </p>
          ) : null}
        </div>

        {/* A barra escorre com o tempo: mostra que ele vai sair sozinho, sem precisar de aviso. */}
        <div className="h-1.5 shrink-0" style={{ backgroundColor: "rgba(242,194,48,0.16)" }}>
          <div
            key={atual.id}
            className="h-full"
            style={{
              backgroundColor: MARCA.amarelo,
              animation: `oferta-tempo ${DURACAO_MS}ms linear forwards`,
            }}
          />
        </div>
      </div>

      <style>{`@keyframes oferta-tempo { from { width: 100% } to { width: 0% } }`}</style>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="leading-tight">
      {/* Rótulo em cinza-claro e valor em branco: os dois em AMARELO brigariam com o número da
          viagem, e a tela perderia a hierarquia que faz o olho achar a rota primeiro. */}
      <span
        className="block uppercase tracking-[0.14em] [font-size:clamp(0.68rem,0.95vw,1.25rem)]"
        style={{ color: MARCA.rotulo }}
      >
        {rotulo}
      </span>
      <span
        className="font-semibold [font-size:clamp(0.95rem,1.6vw,2.2rem)]"
        style={{ color: MARCA.texto }}
      >
        {valor}
      </span>
    </span>
  );
}
