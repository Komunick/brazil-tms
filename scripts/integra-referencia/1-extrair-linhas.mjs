import fs from "node:fs";
const html = fs.readFileSync("C:/Users/Victor/Downloads/Integra_14.2.html", "utf8");

const left = {}, bottom = {};
for (const m of html.matchAll(/\.(x[0-9a-f]+)\s*\{\s*left\s*:\s*(-?[\d.]+)px/g)) left[m[1]] = +m[2];
for (const m of html.matchAll(/\.(y[0-9a-f]+)\s*\{\s*bottom\s*:\s*(-?[\d.]+)px/g)) bottom[m[1]] = +m[2];

const paginas = [];
for (const m of html.matchAll(/<div id="pf[^"]*"[^>]*data-page-no="([0-9a-f]+)"/g)) {
  paginas.push({ n: parseInt(m[1], 16), i: m.index });
}
function paginaDe(i) {
  let lo = 0, hi = paginas.length - 1, r = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (paginas[mid].i <= i) { r = paginas[mid].n; lo = mid + 1; } else hi = mid - 1;
  }
  return r;
}

const limpar = (s) =>
  s.replace(/<[^>]+>/g, "")
   .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
   .replace(/\s+/g, " ").trim();

/**
 * DUAS CAMADAS, e confundi-las foi o que quebrou as três primeiras tentativas.
 *
 * As CÉLULAS de tabela são `<div class="c xA yB">`, e o `y` delas é da página. Mas o texto dentro
 * de uma célula vive em `<div class="t ... yC">` cujo `y` é RELATIVO À CÉLULA — agrupar por ele
 * junta a tabela inteira numa linha só.
 *
 * Já os TÍTULOS ("a. Método setPreSMdeModelo") não são células: são `t` soltos, com `y` de página.
 *
 * Então: célula → usa o `y` do `c`; título → usa o `y` do próprio `t`, e só vale o `t` que não
 * estiver dentro de nenhum `c`.
 */
const pedacos = [];
const dentroDeCelula = [];

const reC = /<div class="c ([^"]*)">/g;
let m;
while ((m = reC.exec(html))) {
  const cls = m[1].split(/\s+/);
  const x = cls.find((c) => /^x[0-9a-f]+$/.test(c));
  const y = cls.find((c) => /^y[0-9a-f]+$/.test(c));

  let d = 1, i = reC.lastIndex;
  while (d > 0 && i < html.length) {
    const a = html.indexOf("<div", i), b = html.indexOf("</div>", i);
    if (b < 0) break;
    if (a >= 0 && a < b) { d++; i = a + 4; } else { d--; i = b + 6; }
  }
  dentroDeCelula.push([m.index, i]);

  if (!x || !y || bottom[y] === undefined) continue;
  const t = limpar(html.slice(reC.lastIndex, i - 6));
  if (t) pedacos.push({ pag: paginaDe(m.index), y: bottom[y], x: left[x] ?? 0, t });
}

dentroDeCelula.sort((a, b) => a[0] - b[0]);
function estaDentro(i) {
  let lo = 0, hi = dentroDeCelula.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = dentroDeCelula[mid];
    if (i < a) hi = mid - 1;
    else if (i > b) lo = mid + 1;
    else return true;
  }
  return false;
}

for (const t of html.matchAll(/<div class="t ([^"]*)">([\s\S]*?)<\/div>/g)) {
  if (estaDentro(t.index)) continue;
  const cls = t[1].split(/\s+/);
  const x = cls.find((c) => /^x[0-9a-f]+$/.test(c));
  const y = cls.find((c) => /^y[0-9a-f]+$/.test(c));
  if (!x || !y || bottom[y] === undefined) continue;
  const s = limpar(t[2]);
  if (s) pedacos.push({ pag: paginaDe(t.index), y: bottom[y], x: left[x] ?? 0, t: s });
}

const mapa = new Map();
for (const c of pedacos) {
  const k = `${c.pag}|${Math.round(c.y * 2)}`;
  if (!mapa.has(k)) mapa.set(k, []);
  mapa.get(k).push(c);
}
const linhas = [...mapa.values()]
  .map((cs) => ({ pag: cs[0].pag, y: cs[0].y, cols: cs.sort((a, b) => a.x - b.x).map((c) => ({ x: c.x, t: c.t })) }))
  .sort((a, b) => a.pag - b.pag || b.y - a.y);

fs.writeFileSync(process.argv[2], JSON.stringify(linhas));
console.log("pedaços:", pedacos.length, "· linhas:", linhas.length);

const i = linhas.findIndex((l) => /^a\. Método setPreSMdeModelo$/.test(l.cols.map((c) => c.t).join(" ")));
console.log("\nDepois do título de setPreSMdeModelo:");
for (const l of linhas.slice(i, i + 8)) console.log("  " + l.cols.map((c) => c.t).join(" | ").slice(0, 90));
