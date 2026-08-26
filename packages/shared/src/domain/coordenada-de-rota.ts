import { ufECidadeDaEstacao } from "./pre-sm-modelos";

/**
 * A COORDENADA DE UMA ESTAÇÃO, tirada do KML das rotas da gerenciadora (2026-08-26, a pedido).
 *
 * ── O PROBLEMA ────────────────────────────────────────────────────────────────────────────────
 *
 * Nenhuma das 459 estações tem latitude e longitude: as colunas existem e estão vazias. Sem a
 * coordenada da origem não dá para ordenar veículos por distância — só dizer "está na mesma cidade".
 *
 * ── DE ONDE SAI ───────────────────────────────────────────────────────────────────────────────
 *
 * `getRotas` com `DevolverKML: "S"` devolve a geometria inteira da rota: 11.440 pontos, num arquivo
 * de 340 KB. O PRIMEIRO ponto é a origem e o ÚLTIMO é o destino, e ambos caem sobre instalações
 * logísticas reais — medido em 26/08 na rota Simões Filho → São Luís, a 4 e a 12 km do centro das
 * respectivas cidades, que é onde pátios ficam.
 *
 * ── PRECISÃO DE CIDADE, E ISSO BASTA ──────────────────────────────────────────────────────────
 *
 * Das 523 rotas cadastradas, só **8** trazem nome de estação na descrição; as outras são "empresa +
 * cidade", e há 50 rotas terminando só em Simões Filho — cada uma num pátio diferente. Então o que
 * se consegue automaticamente é *uma instalação na cidade certa*, não *o nosso pátio*.
 *
 * E é o suficiente. Os caminhões estão a 25, 39, 122 km da coleta: um erro de 8 km na origem não
 * reordena nada. Só embaralharia veículos a poucos quilômetros um do outro — e para esses, "os dois
 * estão perto" já é a resposta certa.
 *
 * Exigir o pátio exato seria pedir uma precisão que a tarefa não usa, e custaria trabalho manual.
 */

/** As duas pontas de uma rota, em graus decimais. */
export interface PontasDaRota {
  origem: { lat: number; lon: number } | null;
  destino: { lat: number; lon: number } | null;
}

/**
 * Lê o primeiro e o último ponto do KML.
 *
 * ── A ORDEM DO KML É `lon,lat`, e não o contrário ─────────────────────────────────────────────
 *
 * É o padrão do formato, e é o inverso de como se fala ("latitude e longitude"). Trocar os dois põe
 * o Brasil na Somália — e o mapa mostra caminhões na África sem nenhum erro aparecer.
 *
 * A guarda contra isso é a faixa: no Brasil a latitude vive entre -34 e +6, e a longitude entre -74
 * e -34. Um par invertido cai fora e é recusado.
 */
export function pontasDoKML(kml: string | null | undefined): PontasDaRota {
  const blocos = [...String(kml ?? "").matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)].map(
    (m) => m[1]!.trim(),
  );
  const pontos = blocos.join(" ").split(/\s+/).filter(Boolean);
  if (pontos.length === 0) return { origem: null, destino: null };
  return {
    origem: lerPonto(pontos[0]!),
    destino: lerPonto(pontos[pontos.length - 1]!),
  };
}

function lerPonto(s: string): { lat: number; lon: number } | null {
  const [lon, lat] = s.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  return dentroDoBrasil(lat!, lon!) ? { lat: lat!, lon: lon! } : null;
}

/**
 * A caixa que contém o Brasil, com folga.
 *
 * Não é validação de qualidade — é a rede que pega o par invertido e a coordenada corrompida. Uma
 * rota nossa fora desta caixa é erro de origem, não uma viagem internacional.
 */
export function dentroDoBrasil(lat: number, lon: number): boolean {
  return lat >= -34 && lat <= 6 && lon >= -74 && lon <= -34;
}

/**
 * A CIDADE DE UMA PONTA DA ROTA, como a gerenciadora escreve.
 *
 * Ela manda `"SIMOES FILHO/BA/BRASIL"` ou `"SAO LUIS/MA/MA"` — repare que o terceiro campo às vezes
 * é o país e às vezes repete a UF. Por isso só os DOIS primeiros são lidos, e o resto ignorado.
 *
 * Devolve a chave no mesmo formato de `chaveDaEstacao` (`"BA SIMOES FILHO"`), para os dois lados da
 * comparação saírem do mesmo normalizador. Dois normalizadores divergem em silêncio, e já custou
 * caro nesta base.
 */
export function chaveDaCidadeDelas(cidadeUf: string | null | undefined): string {
  const partes = String(cidadeUf ?? "").split("/");
  if (partes.length < 2) return "";
  const cidade = partes[0]!.trim();
  const uf = partes[1]!.trim();
  if (!/^[A-Za-z]{2}$/.test(uf)) return "";
  // Reusa o normalizador das estações montando o formato que ele entende (`PREFIXO_UF_CIDADE`).
  const { uf: u, cidade: c } = ufECidadeDaEstacao(`X_${uf}_${cidade}`);
  return u && c ? `${u} ${c}` : "";
}

/**
 * A DISTÂNCIA EM LINHA RETA entre dois pontos, em quilômetros (2026-08-26).
 *
 * ── LINHA RETA, E NÃO ESTRADA ─────────────────────────────────────────────────────────────────
 *
 * A tela da gerenciadora mostra "25 kms" e provavelmente é rodoviário. O nosso é a reta, e a
 * diferença precisa estar DITA na tela — um caminhão a 30 km em linha reta pode estar a 80 de
 * estrada se houver uma serra ou uma baía no meio.
 *
 * Calcular rota real exigiria um serviço de roteirização por par de pontos, o que a constituição
 * não proíbe mas ninguém pediu, e que custaria uma chamada por caminhão por viagem. Para ORDENAR
 * quem está perto, a reta acerta a esmagadora maioria das vezes; para prometer tempo de chegada,
 * não serviria — e não é isso que a tela promete.
 *
 * ── HAVERSINE, E O RAIO QUE IMPORTA ───────────────────────────────────────────────────────────
 *
 * 6.371 km é o raio médio da Terra. A Terra não é esfera, e o erro disso no Brasil fica abaixo de
 * meio por cento — irrelevante para ordenar caminhões, e muito menor que o erro de a origem ser a
 * cidade e não o pátio.
 */
export function distanciaKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
