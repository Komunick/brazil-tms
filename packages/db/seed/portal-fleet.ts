import "dotenv/config";
import { readFileSync } from "node:fs";
import { parse as parseCsv } from "csv-parse/sync";
import { and, eq, isNull, sql } from "drizzle-orm";
import { carriers, db, drivers } from "../src";

/**
 * Carga do cadastro de motoristas a partir da EXPORTAÇÃO DO PORTAL DO CLIENTE (2026-08-18).
 *
 * Fonte: aba "Força de Trabalho › Motoristas 3PL", botão Exportar — arquivo `br_driver_<data>.csv`.
 *
 * POR QUE ESTA FONTE, E NÃO A PLANILHA DE PROGRAMAÇÃO (`db:seed:shopee`)
 *
 * A planilha é mantida à mão e envelhece. Esta exportação é o cadastro que o próprio cliente usa
 * para pôr motorista em viagem — é literalmente a mesma tabela de onde saem os nomes que chegam pelo
 * robô. Enquanto o TMS não tiver o motorista que o portal atribuiu, a viagem fica "Ag. comparecimento"
 * sem ninguém: em 2026-08-18 eram 54 viagens assim em produção, e os 54 motoristas estavam AQUI,
 * todos `Active`. Nenhuma delas era erro de mapeamento de status — era cadastro faltando.
 *
 * IDEMPOTENTE. A chave natural é o CPF quando existe, e o nome dobrado (sem acento, maiúsculo,
 * espaços colapsados — o MESMO dobramento de `portal-fleet-link.ts`) quando não existe. Rodar de
 * novo com uma exportação mais nova corrige em vez de duplicar.
 *
 * Uso:
 *   pnpm --filter @brazil-tms/db db:seed:portal-fleet "C:/Users/Victor/Downloads/br_driver_....csv"
 *   pnpm --filter @brazil-tms/db db:seed:portal-fleet <arquivo> --aplicar
 *
 * Sem `--aplicar` ele NÃO escreve: mostra o que faria. Um cadastro de mil e trezentas pessoas em
 * produção merece ser lido antes de acontecer.
 */

/**
 * O QUE A EXPORTAÇÃO TRAZ, E O QUE ELA ESCONDE (medido em 2026-08-18, 1354 linhas)
 *
 * CPF, telefone e número da CNH vêm preenchidos SOMENTE nas linhas `Active` — exatamente 375 de
 * 1354. Nas outras 979 esses três campos vêm vazios; não é falha da exportação, é o portal não
 * entregando dado pessoal de quem está desativado. Por isso a chave cai para o nome nesses casos, e
 * por isso um motorista inativo entra sem CPF em vez de entrar com CPF em branco disfarçado.
 *
 * Dois defeitos de formato, ambos do Excel e ambos reversíveis:
 *   - `Driver ID` acima de 1 milhão sai em notação científica (`4.164176e+06`). São 6 dígitos
 *     significativos para um inteiro de 7, então `Math.round` devolve o número exato.
 *   - `Phone Number` e `License Number` vêm com apóstrofo na frente (a proteção que o Excel usa para
 *     não comer o zero à esquerda).
 */

/**
 * OS 12 STATUS DO PORTAL, LIDOS DO PRÓPRIO FILTRO (2026-08-18)
 *
 * `Active` · `Auto-Inactive` · `Deactivated` · `Inactive` · `Pending Active` · `Pre-Suspended` ·
 * `Pre-Suspended(FV)` · `Pre-Suspended(KYC)` · `Suspended` · `Suspended(FV)` · `Suspended(KYC)` ·
 * `Terminated`
 *
 * Hoje só cinco têm gente (Inactive 642, Active 375, Auto-Inactive 329, Deactivated 7, Suspended 1),
 * mas os doze estão aqui porque um status que aparecer amanhã não pode virar "ativo" por omissão.
 *
 * SÓ `Active` VIRA ATIVO NO TMS, e isso é a decisão inteira deste arquivo. O vínculo automático
 * (`linkFleetFromPortal`) só casa motorista `active` — então mapear um desativado para `active` faria
 * o robô pôr na estrada exatamente quem o cliente tirou de circulação. Os demais entram cadastrados
 * e visíveis, com o status do portal escrito na observação, e alguém os ativa na tela se precisar.
 *
 * A separação entre `inactive` e `blocked` é informativa, não funcional: nenhum dos dois recebe
 * viagem. `blocked` fica para o que o cliente tratou como punição ou desligamento, `inactive` para o
 * que é só ausência.
 */
const STATUS_TMS: Record<string, "active" | "inactive" | "blocked"> = {
  Active: "active",
  Inactive: "inactive",
  "Auto-Inactive": "inactive",
  "Pending Active": "inactive",
  Deactivated: "blocked",
  Terminated: "blocked",
  Suspended: "blocked",
  "Suspended(FV)": "blocked",
  "Suspended(KYC)": "blocked",
  "Pre-Suspended": "blocked",
  "Pre-Suspended(FV)": "blocked",
  "Pre-Suspended(KYC)": "blocked",
};

/**
 * A transportadora (decisão do usuário, 2026-08-18).
 *
 * Todos entram como subcontratados de "Agregados" — o mesmo nome que o ambiente de testes já usa
 * (878 motoristas lá), para os dois ambientes falarem a mesma língua. Produção tinha só uma
 * transportadora cadastrada, "Transportes Parceiros (Demo)", que é resíduo de teste.
 *
 * Não é uma classificação inventada: o CHECK da tabela exige transportadora quando o motorista é
 * subcontratado, e `assignTrip` recusa a atribuição sem ela — foi o que travou 48 vínculos na
 * primeira tentativa de espelhar o portal. Separar por empresa real depois é um UPDATE, sem recarga.
 */
const TRANSPORTADORA = "Agregados";

const ACENTOS = "ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑáàãâäéèêëíìîïóòõôöúùûüçñ";
const SEM_ACENTO = "AAAAAEEEEIIIIOOOOOUUUUCNAAAAAEEEEIIIIOOOOOUUUUCN";

/** O dobramento de `portal-fleet-link.ts`, repetido aqui de propósito: se os dois divergirem, o
 * cadastro carregado deixa de casar com a viagem — que é o único motivo de este arquivo existir. */
function dobrarNome(valor: string): string {
  const semAcento = [...valor]
    .map((c) => {
      const i = ACENTOS.indexOf(c);
      return i === -1 ? c : SEM_ACENTO[i]!;
    })
    .join("");
  return semAcento.replace(/\s+/g, " ").trim().toUpperCase();
}

const dobrarNomeSql = (col: ReturnType<typeof sql>): ReturnType<typeof sql> =>
  sql`upper(btrim(regexp_replace(translate(${col}, ${ACENTOS}, ${SEM_ACENTO}), '\\s+', ' ', 'g')))`;

/** Tira o apóstrofo que o Excel põe na frente e tudo que não for dígito. */
const soDigitos = (valor: string | undefined): string | null => {
  const limpo = (valor ?? "").replace(/\D/g, "");
  return limpo === "" ? null : limpo;
};

/** `4.164176e+06` → `4164176`. Sem perda: são 7 dígitos com 7 significativos. */
function idDoPortal(valor: string | undefined): string | null {
  const texto = (valor ?? "").trim();
  if (texto === "") return null;
  if (/^\d+$/.test(texto)) return texto;
  const numero = Number(texto);
  return Number.isFinite(numero) ? String(Math.round(numero)) : null;
}

/** Data ISO ou nada. Uma validade ilegível não pode virar `null` silencioso nem quebrar a carga. */
function dataOuNulo(valor: string | undefined): string | null {
  const texto = (valor ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

/** A marca que torna a observação reescrevível sem apagar o que uma pessoa escreveu. */
const MARCA = "Cadastro do portal do cliente";

type Linha = Record<string, string>;

async function transportadora(): Promise<string> {
  const existente = await db
    .select({ id: carriers.id })
    .from(carriers)
    .where(eq(carriers.name, TRANSPORTADORA))
    .limit(1);
  if (existente[0]) return existente[0].id;
  const criada = await db
    .insert(carriers)
    .values({ name: TRANSPORTADORA })
    .returning({ id: carriers.id });
  console.log(`transportadora "${TRANSPORTADORA}" criada`);
  return criada[0]!.id;
}

async function main(): Promise<void> {
  const caminho = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  if (!caminho) throw new Error("informe o caminho do br_driver_<data>.csv");

  const bruto = readFileSync(caminho, "utf8").replace(/^\uFEFF/, "");
  const linhas = parseCsv(bruto, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Linha[];
  console.log(`${linhas.length} linhas lidas de ${caminho}`);

  const carrierId = aplicar ? await transportadora() : null;

  const contagem = { criados: 0, atualizados: 0, iguais: 0 };
  const porStatus: Record<string, number> = {};
  const nomesRepetidos = new Map<string, number>();
  const semNome: string[] = [];

  for (const linha of linhas) {
    const nome = (linha["Driver Name"] ?? "").trim();
    if (nome === "") {
      semNome.push(idDoPortal(linha["Driver ID"]) ?? "(sem id)");
      continue;
    }
    const dobrado = dobrarNome(nome);
    nomesRepetidos.set(dobrado, (nomesRepetidos.get(dobrado) ?? 0) + 1);

    const statusPortal = (linha["Status"] ?? "").trim();
    porStatus[statusPortal] = (porStatus[statusPortal] ?? 0) + 1;
    const status = STATUS_TMS[statusPortal];
    if (!status) {
      // Um status que não estava no filtro quando este arquivo foi escrito. Ele NÃO entra como ativo
      // por omissão — para nesta linha e pede leitura humana.
      throw new Error(
        `status desconhecido no portal: "${statusPortal}" (motorista ${nome}). ` +
          `Acrescente-o a STATUS_TMS depois de decidir se ele pode dirigir.`,
      );
    }

    const cpf = soDigitos(linha["CPF"]);
    const portalId = idDoPortal(linha["Driver ID"]);
    const valores = {
      name: nome,
      cpf,
      phone: soDigitos(linha["Phone Number"]),
      licenseNumber: soDigitos(linha["License Number"]),
      licenseCategory: (linha["License Type"] ?? "").trim() || null,
      licenseExpiry: dataOuNulo(linha["License Expiry Date"]),
      ownershipType: "subcontracted" as const,
      carrierId: carrierId ?? undefined,
      status,
    };
    const nota = `${MARCA} — ID ${portalId ?? "?"}, status ${statusPortal}.`;

    /**
     * TRÊS TENTATIVAS, NESTA ORDEM — e cada uma existe por um erro medido (2026-08-18).
     *
     * 1. ID DO PORTAL, gravado na observação por esta mesma carga. É a única chave que não mente:
     *    uma vez carregado, o motorista é reencontrado por ela mesmo que mude de nome ou corrijam
     *    o CPF dele no portal.
     *
     * 2. CPF. Identifica a pessoa, mas só serve quando os dois lados o têm — e não têm: produção
     *    não tem CPF em NENHUM cadastro. Sozinha, esta chave ia criar 1076 motoristas onde só
     *    existiam 932 novos, recriando gente que já estava lá.
     *
     * 3. NOME, e só em registro que nenhum outro motorista do portal já reivindicou. É a queda que
     *    salva os cadastros antigos, e o filtro do `NOT LIKE` é o que impede o dano oposto: sem ele,
     *    dois homônimos de verdade (há dois "JOSE EDSON DA SILVA", com IDs e CPFs distintos)
     *    viravam um só, e um motorista real sumia do TMS.
     *
     * Por que o CPF não basta para separar homônimo de duplicata: os CPFs antigos estão errados. Dos
     * 9 nomes repetidos que apareceram no ambiente de testes, 8 eram a MESMA pessoa com o zero à
     * esquerda comido (`510691218` no lugar de `00510691218`) ou um dígito trocado. Só o ID do
     * portal distingue os dois casos.
     */
    const marcaId = portalId ? `${MARCA} — ID ${portalId},%` : null;
    const porId = marcaId
      ? await db.select({ id: drivers.id, notes: drivers.notes }).from(drivers)
          .where(and(sql`${drivers.notes} LIKE ${marcaId}`, isNull(drivers.archivedAt))).limit(1)
      : [];
    const porCpf = porId[0] || !cpf
      ? []
      : await db.select({ id: drivers.id, notes: drivers.notes }).from(drivers)
          .where(and(eq(drivers.cpf, cpf), isNull(drivers.archivedAt))).limit(1);
    const porNome = porId[0] || porCpf[0]
      ? []
      : await db.select({ id: drivers.id, notes: drivers.notes }).from(drivers)
          .where(and(
            sql`${dobrarNomeSql(sql`${drivers.name}`)} = ${dobrado}`,
            sql`(${drivers.notes} IS NULL OR ${drivers.notes} NOT LIKE ${`${MARCA} — ID %`})`,
            isNull(drivers.archivedAt),
          )).limit(1);
    const achado = porId[0] ? porId : porCpf[0] ? porCpf : porNome;

    if (!achado[0]) {
      contagem.criados += 1;
      if (aplicar) await db.insert(drivers).values({ ...valores, notes: nota });
      continue;
    }

    contagem.atualizados += 1;
    if (aplicar) {
      // A observação escrita por uma pessoa não é sobrescrita: só a nossa própria é reescrita.
      const anterior = achado[0].notes ?? "";
      const notes = anterior === "" || anterior.startsWith(MARCA) ? nota : anterior;
      await db
        .update(drivers)
        .set({ ...valores, notes, updatedAt: new Date() })
        .where(eq(drivers.id, achado[0].id));
    }
  }

  console.log(aplicar ? "=== APLICADO" : "=== SIMULAÇÃO (sem --aplicar nada foi escrito)");
  console.log(`  criados      ${contagem.criados}`);
  console.log(`  atualizados  ${contagem.atualizados}`);
  console.log(`  por status   ${JSON.stringify(porStatus)}`);

  const repetidos = [...nomesRepetidos].filter(([, n]) => n > 1);
  if (repetidos.length > 0) {
    console.log(
      `\nATENÇÃO — ${repetidos.length} nome(s) aparecem mais de uma vez na exportação:\n  ` +
        repetidos.map(([n, q]) => `${n} (${q}×)`).join("\n  ") +
        `\nSão pessoas diferentes com o mesmo nome, e entraram como cadastros separados (é o certo).\n` +
        `Só que o vínculo automático casa POR NOME e pega o primeiro — então uma viagem de um deles\n` +
        `pode ir parar no homônimo. Não há como o robô decidir isso sozinho: confira na tela.`,
    );
  }
  if (semNome.length > 0) console.log(`\nlinhas sem nome, ignoradas: ${semNome.join(", ")}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(String(e));
    process.exit(1);
  });
