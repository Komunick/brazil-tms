/*
 * O QUE O getPosicoes JÁ MANDAVA E A GENTE JOGAVA FORA (2026-08-28, a pedido).
 *
 * O pedido foi "os pontos azuis e vermelhos não fazem sentido, não dá para entender". Estava certo:
 * as cores diziam apenas QUAL LINHA DA LISTA está selecionada — não diziam nada sobre o caminhão.
 *
 * Para a cor significar alguma coisa, faltava dado. E ele já vinha na resposta: medido contra a
 * produção em 28/08, com 108 posições reais, o `getPosicoes` devolve
 *
 *   CodTerminal      108/108      TipoRastreador   108/108
 *   DistUltPosicao   108/108      Ignicao          108/108   (53 ligadas, 53 desligadas, 2 sem sinal)
 *   VeloMediaCalc     39/108      Velocidade        37/108   (máxima 96 km/h)
 *
 * Guardávamos só nove desses campos. As três colunas abaixo são as que mudam o que a tela consegue
 * dizer.
 *
 * ── VELOCIDADE SÓ VEM QUANDO O CAMINHÃO ANDA, e isso é informação ─────────────────────────────
 *
 * Dos 108, 37 trouxeram velocidade, e NENHUM deles com valor zero. Ou seja: o campo não é "0 quando
 * parado" — ele simplesmente não vem. Então `NULL` aqui não significa "não sei", significa quase
 * sempre "não estava se movendo", e a leitura correta é sempre velocidade JUNTO da ignição:
 *
 *   ignição L + velocidade   -> rodando, e a quantos km/h
 *   ignição L sem velocidade -> ligado e parado (motor em marcha lenta, carga, fila)
 *   ignição D                -> desligado
 *
 * Isso é o que as cores do mapa passam a dizer, no lugar de "esta é a linha que você clicou".
 *
 * ── TIPO DE RASTREADOR MUDA A CONFIANÇA NA POSIÇÃO ────────────────────────────────────────────
 *
 * `RA` é rastreador (reporta sozinho, de minuto em minuto); `LP` é localizador (responde quando
 * perguntado). Uma posição de LP com uma hora não quer dizer o mesmo que uma posição de RA com uma
 * hora — a segunda é sinal de problema, a primeira é o normal do aparelho.
 *
 * ── E A DISTÂNCIA DESDE A ÚLTIMA POSIÇÃO ──────────────────────────────────────────────────────
 *
 * Zero com ignição ligada por muito tempo é caminhão parado com motor rodando. É o dado que separa
 * "está indo" de "está lá há três horas", sem precisar de histórico de trajeto — que continua fora
 * de escopo, com outro tamanho e sem pedido.
 *
 * TUDO NULO POR PADRÃO, e a carga preenche no próximo ciclo (o job roda de minuto em minuto). Não
 * há backfill possível: são campos do instante, e o instante passou.
 */
ALTER TABLE "logae_positions"
  ADD COLUMN IF NOT EXISTS "velocidade" integer;--> statement-breakpoint

ALTER TABLE "logae_positions"
  ADD COLUMN IF NOT EXISTS "tipo_rastreador" text;--> statement-breakpoint

ALTER TABLE "logae_positions"
  ADD COLUMN IF NOT EXISTS "dist_ult_posicao" double precision;
