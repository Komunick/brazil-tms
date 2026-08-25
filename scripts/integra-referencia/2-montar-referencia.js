const fs = require("fs");
const linhas = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

const txt = (l) => l.cols.map((c) => c.t).join(" ").trim();
const ehCabecalho = (l) => {
  const c = l.cols.map((x) => x.t);
  return c.length >= 5 && c[0] === "#" && /^Campo$/i.test(c[1] || "");
};

function encaixar(l, anc) {
  const out = new Array(anc.length).fill("");
  for (const c of l.cols) {
    let melhor = 0, dist = Infinity;
    for (let i = 0; i < anc.length; i++) {
      const d = Math.abs(c.x - anc[i]);
      if (d < dist) { dist = d; melhor = i; }
    }
    out[melhor] = out[melhor] ? `${out[melhor]} ${c.t}` : c.t;
  }
  return out;
}

// ── 1. O índice do manual: método → página impressa. Tem os 58, inclusive os sem título. ────────
const indice = [];
for (const l of linhas) {
  const m = txt(l).match(/^[a-z]{1,3}\.\s*Método\s+([A-Za-z]{3,})\s+(\d{1,3})$/);
  if (m) indice.push({ nome: m[1], impressa: +m[2] });
}

// ── 2. Os blocos de campos ──────────────────────────────────────────────────────────────────────
const blocos = [];
let bloco = null, secao = null, anc = null, ultimo = null;
let titulo = null, tituloPag = -99;

for (const l of linhas) {
  const t = txt(l);

  const mt = t.match(/^[a-z]{1,3}\.\s*Método\s+([A-Za-z]{3,})\s*$/);
  if (mt) { titulo = mt[1]; tituloPag = l.pag; continue; }

  // O marcador nem sempre é "■ Layout da Requisição": em muitas páginas ele vem como
  // "i. Layout da Requisição". Exigir o ■ perdia a família inteira de programação de cargas —
  // dezoito métodos sumiam em silêncio, e um manual de referência com furos é pior do que nenhum,
  // porque quem consulta acha que já procurou.
  if (t.length < 40 && /Layout d[ae] (Requisi|Retorno)/i.test(t)) {
    const req = /Requisi/i.test(t);
    if (req || !bloco) {
      bloco = {
        titulo: req && l.pag - tituloPag <= 1 ? titulo : null,
        nomeRet: null, pagina: l.pag, req: [], ret: [],
      };
      blocos.push(bloco);
      // O título vale para UM bloco: sem consumi-lo, o método seguinte na mesma página herdaria
      // este, e os campos iriam para o dono errado.
      if (bloco.titulo) { titulo = null; tituloPag = -99; }
    }
    secao = req ? "req" : "ret";
    anc = null; ultimo = null;
    continue;
  }
  if (/^■?\s*Exemplo de/i.test(t)) { secao = null; anc = null; ultimo = null; continue; }
  if (!bloco || !secao) continue;

  if (ehCabecalho(l)) { anc = l.cols.map((c) => c.x); continue; }
  if (!anc) continue;
  if (/^Versão [\d.]+ – |^\d{1,3}$/.test(t)) continue;

  const c = encaixar(l, anc);
  const nome = (c[1] || "").trim();
  if (!nome && ultimo && (c[2] || "").trim()) { ultimo.desc += " " + c[2].trim(); continue; }
  if (!nome || /\s/.test(nome)) { if (ultimo && nome) ultimo.desc += " " + nome; continue; }

  const nb = (c[0] || "").trim();
  ultimo = {
    nivel: /^\d+$/.test(nb) ? +nb : 1,
    nome,
    desc: (c[2] || "").trim(),
    tipo: (c[3] || "").trim(),
    tam: (c[4] || "").trim(),
    dec: (c[5] || "").trim(),
    obr: (c[6] || "").trim(),
  };
  bloco[secao].push(ultimo);

  if (secao === "ret" && /^Metodo$/i.test(nome) && !bloco.nomeRet) {
    const m = ultimo.desc.match(/[‘'"]?([A-Za-z]{3,})[’'"]?/);
    if (m) bloco.nomeRet = m[1];
  }
}

// ── 3. Nomear: título > índice por página > nome declarado no retorno ───────────────────────────
const porTitulo = new Map();
for (const b of blocos) if (b.titulo) porTitulo.set(b.titulo, b.pagina);
const difs = indice.filter((i) => porTitulo.has(i.nome)).map((i) => porTitulo.get(i.nome) - i.impressa);
difs.sort((a, b) => a - b);
const desloc = difs.length ? difs[Math.floor(difs.length / 2)] : 0;

const marcos = indice
  .map((i) => ({ nome: i.nome, pag: i.impressa + desloc }))
  .sort((a, b) => a.pag - b.pag);

/** O método cuja seção começou mais recentemente antes desta página. */
function doIndice(pag) {
  let r = null;
  for (const m of marcos) { if (m.pag <= pag) r = m.nome; else break; }
  return r;
}

for (const b of blocos) b.nome = b.titulo || doIndice(b.pagina) || b.nomeRet;

const porNome = new Map();
for (const b of blocos) {
  if (!b.nome) continue;
  const j = porNome.get(b.nome);
  if (!j) porNome.set(b.nome, { nome: b.nome, pagina: b.pagina, req: b.req, ret: b.ret });
  else {
    if (b.req.length > j.req.length) j.req = b.req;
    if (b.ret.length > j.ret.length) j.ret = b.ret;
    j.pagina = Math.min(j.pagina, b.pagina);
  }
}

const metodos = [...porNome.values()].sort((a, b) => a.pagina - b.pagina);
const noIndice = new Set(indice.map((i) => i.nome));
const faltam = [...noIndice].filter((n) => !porNome.has(n));

console.log("no índice:", noIndice.size, "· extraídos:", metodos.length, "· deslocamento:", desloc);
console.log("sem campos:", faltam.join(", ") || "nenhum");

// ── 4. O documento ──────────────────────────────────────────────────────────────────────────────
const TIPOS = { I: "inteiro", T: "texto", N: "numérico", D: "data", DH: "data e hora", R: "registro", B: "booleano" };

function tabela(campos) {
  if (!campos.length) return "_(sem campos extraídos)_\n";
  const l = ["| campo | tipo | tam. | obr. | descrição |", "|---|---|---|---|---|"];
  for (const f of campos) {
    const ind = "&nbsp;&nbsp;".repeat(Math.max(0, f.nivel - 1));
    const tipo = TIPOS[f.tipo] ? `${f.tipo} — ${TIPOS[f.tipo]}` : f.tipo || "";
    const obr = f.obr === "S" ? "**sim**" : f.obr === "NM" ? "lista" : f.obr === "N" ? "não" : f.obr;
    const d = (f.desc || "").replace(/\|/g, "\\|").trim();
    l.push(`| ${ind}\`${f.nome}\` | ${tipo} | ${f.tam || ""} | ${obr} | ${d} |`);
  }
  return l.join("\n") + "\n";
}

const out = [];
out.push("# Integra 14.2 — referência dos métodos (extraída do manual da Logae)");
out.push("");
out.push("> **Gerado por extração**, não digitado à mão. A fonte é o PDF `Integra_14.2.html`");
out.push("> (versão 14.0, 22/10/2025), convertido pelo `pdf2htmlEX`. O script de extração está em");
out.push("> `scripts/integra-referencia/`.");
out.push(">");
out.push("> **Isto não substitui o manual em caso de dúvida.** A extração recupera as tabelas pela");
out.push("> posição do texto na página, e o manual tem erros próprios — a resposta do");
out.push("> `setPreSMdeModelo`, por exemplo, declara `setEfetivaPreSM` no campo `Metodo`.");
out.push("");
out.push("Endereço: `https://integra.logae.com.br/datasnap/rest/TWebService/\"<metodo>\"` — o nome do");
out.push("método vai **entre aspas** na URL (`%22` escapado). POST com JSON. Todo corpo leva");
out.push("`Ambiente`, `Login`, `Senha` e `TipoRetorno`.");
out.push("");
out.push("Toda resposta traz `CodErro` (**zero = sem erro**) e `MsgErro`, sob `result[0]`. O código");
out.push("HTTP é sempre 200 — **o erro nunca está nele**.");
out.push("");
out.push(`Extraídos **${metodos.length}** dos **${noIndice.size}** métodos que o índice do manual lista.`);
out.push("");
if (faltam.length) {
  out.push("### Os que a extração NÃO recuperou");
  out.push("");
  out.push("Ficam de fora porque a seção deles começa na mesma página da anterior, e o extrator");
  out.push("não tem como separar as duas. **Para estes, o manual é a única fonte:**");
  out.push("");
  for (const n of faltam.sort()) out.push(`- \`${n}\``);
  out.push("");
  out.push("Estar nesta lista é o desfecho bom — o ruim seria aparecerem com os campos de outro");
  out.push("método, e é por isso que o extrator prefere omitir a adivinhar.");
  out.push("");
}
out.push("## Índice");
out.push("");
for (const m of metodos) out.push(`- [\`${m.nome}\`](#${m.nome.toLowerCase()}) — pág. ${m.pagina}`);
out.push("");

for (const m of metodos) {
  out.push("---");
  out.push("");
  out.push(`## ${m.nome}`);
  out.push("");
  out.push(`Página ${m.pagina} do manual.`);
  out.push("");
  out.push("### Requisição");
  out.push("");
  out.push(tabela(m.req));
  out.push("### Retorno");
  out.push("");
  out.push(tabela(m.ret));
}

fs.writeFileSync(process.argv[3], out.join("\n"));
console.log("documento:", (out.join("\n").length / 1024).toFixed(0) + " KB");
