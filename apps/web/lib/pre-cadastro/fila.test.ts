import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

/**
 * A FILA, contra um banco de verdade (fatia 028, etapa 2).
 *
 * A consulta tem função de janela e dois `left join`. É o tipo de código que passa em qualquer
 * teste com uma linha só e erra com duas — mostrando o PRIMEIRO envio em vez do último, ou perdendo
 * a linha inteira quando o `join` do motorista não casa.
 *
 * Por isso todo caso aqui tem mais de uma linha, e o reenvio tem texto DIFERENTE do primeiro: se a
 * consulta pegasse o envio errado, o nome viria trocado e o teste cairia.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * CPFs EXCLUSIVOS DESTE ARQUIVO — não repita os de `route-resposta-identica.test.ts`.
 *
 * O vitest roda arquivos em PARALELO contra o mesmo banco. Quando os dois usavam os mesmos CPFs,
 * um derrubava o outro com `duplicate key ... driver_preregistrations_cpf_aberto_uq` — e a leitura
 * inocente disso seria "o índice único está errado", quando ele estava fazendo exatamente o que
 * deve. O defeito era dos testes.
 *
 * Dígito verificador válido: o esquema recusa qualquer coisa que não seja um CPF real.
 */
const CPF_A = "52867491355";
const CPF_B = "74218539600";
/** Do teste dos candidatos ao envio — próprios, para não depender da ordem dos testes acima. */
const CPF_C = "61830492713";
const CPF_D = "83512704662";

const criados = { pre: [] as string[], motorista: null as string | null };

describe.skipIf(!hasDb)("a fila de pré-cadastros", () => {
  afterAll(async () => {
    const { db } = await import("@brazil-tms/db");
    const { drivers, driverPreregistrations, driverPreregistrationSubmissions, auditLogs } =
      await import("@brazil-tms/db/schema");
    const { inArray, eq } = await import("drizzle-orm");
    if (criados.pre.length) {
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, criados.pre));
      await db
        .delete(driverPreregistrationSubmissions)
        .where(inArray(driverPreregistrationSubmissions.preregistrationId, criados.pre));
      await db.delete(driverPreregistrations).where(inArray(driverPreregistrations.id, criados.pre));
    }
    if (criados.motorista) await db.delete(drivers).where(eq(drivers.id, criados.motorista));
  });

  it("mostra o ÚLTIMO envio, conta os envios e resolve o motorista da atualização", async () => {
    const { db, listarFilaDePreCadastros } = await import("@brazil-tms/db");
    const { drivers, driverPreregistrations, driverPreregistrationSubmissions } = await import(
      "@brazil-tms/db/schema"
    );

    // Caso A: duas submissões. A segunda corrige o nome — é ela que a fila tem de mostrar.
    const [a] = await db
      .insert(driverPreregistrations)
      .values({ cpf: CPF_A, tipo: "novo" })
      .returning({ id: driverPreregistrations.id });
    criados.pre.push(a!.id);
    await db.insert(driverPreregistrationSubmissions).values({
      preregistrationId: a!.id,
      dados: { nome: "NOME ERRADO DA PRIMEIRA", celular: "71988887777" },
      recebidoEm: new Date(Date.now() - 60_000),
    });
    await db.insert(driverPreregistrationSubmissions).values({
      preregistrationId: a!.id,
      dados: { nome: "Nome Certo da Segunda", celular: "71992067086" },
    });

    // Caso B: CPF de motorista existente — a fila tem de trazer o nome dele ao lado.
    const nomeMotorista = `Teste 028 ${randomUUID().slice(0, 8)}`;
    const [m] = await db
      .insert(drivers)
      .values({ name: nomeMotorista, ownershipType: "owned", cpf: CPF_B })
      .returning({ id: drivers.id });
    criados.motorista = m!.id;
    const [b] = await db
      .insert(driverPreregistrations)
      .values({ cpf: CPF_B, tipo: "atualizacao", driverId: m!.id })
      .returning({ id: driverPreregistrations.id });
    criados.pre.push(b!.id);
    await db
      .insert(driverPreregistrationSubmissions)
      .values({ preregistrationId: b!.id, dados: { nome: "Quem Mandou", celular: "71999990000" } });

    const fila = await listarFilaDePreCadastros();
    const itemA = fila.find((i) => i.cpf === CPF_A);
    const itemB = fila.find((i) => i.cpf === CPF_B);

    // O ponto do teste: o SEGUNDO envio é o que vale.
    expect(itemA?.nome).toBe("Nome Certo da Segunda");
    expect(itemA?.celular).toBe("71992067086");
    expect(itemA?.envios).toBe(2);
    expect(itemA?.tipo).toBe("novo");

    // O `left join` do motorista casou, e uma linha só continua aparecendo uma vez.
    expect(itemB?.tipo).toBe("atualizacao");
    expect(itemB?.motoristaNome).toBe(nomeMotorista);
    expect(fila.filter((i) => i.cpf === CPF_B)).toHaveLength(1);
  });

  it("arquivar tira da fila, guarda o motivo e não apaga a linha", async () => {
    const { db, arquivarPreCadastro, listarFilaDePreCadastros } = await import("@brazil-tms/db");
    const { driverPreregistrations, users } = await import("@brazil-tms/db/schema");
    const { eq } = await import("drizzle-orm");

    const [quem] = await db.select({ id: users.id }).from(users).limit(1);
    const alvo = criados.pre[0]!;

    expect(await arquivarPreCadastro(alvo, quem!.id, "duplicado no teste")).toBe(true);
    // Segunda vez é `false`, não erro: dois cliques não podem virar duas histórias.
    expect(await arquivarPreCadastro(alvo, quem!.id, "de novo")).toBe(false);

    expect((await listarFilaDePreCadastros()).some((i) => i.id === alvo)).toBe(false);

    // MARCA, não apaga (princípio III): a linha continua lá, com autor e motivo.
    const [linha] = await db
      .select({
        arquivadoEm: driverPreregistrations.arquivadoEm,
        arquivadoPor: driverPreregistrations.arquivadoPor,
        motivo: driverPreregistrations.arquivadoMotivo,
      })
      .from(driverPreregistrations)
      .where(eq(driverPreregistrations.id, alvo));
    expect(linha?.arquivadoEm).not.toBeNull();
    expect(linha?.arquivadoPor).toBe(quem!.id);
    expect(linha?.motivo).toBe("duplicado no teste");
  });

  it("o CPF arquivado pode voltar — é para isso que o índice único é parcial", async () => {
    const { db } = await import("@brazil-tms/db");
    const { driverPreregistrations } = await import("@brazil-tms/db/schema");
    // O CPF_A foi arquivado no teste acima; um novo pré-cadastro dele tem de ser aceito.
    const [volta] = await db
      .insert(driverPreregistrations)
      .values({ cpf: CPF_A, tipo: "novo" })
      .returning({ id: driverPreregistrations.id });
    expect(volta?.id).toBeTruthy();
    criados.pre.push(volta!.id);
  });

  /**
   * OS CANDIDATOS AO ENVIO — e as três coisas que impedem um cadastro de ser mandado duas vezes.
   *
   * Aqui é onde a garantia mora: o botão de uma linha, a leitura da CNH e um lote qualquer chamam
   * todos a MESMA consulta, e é ela que recusa. Um `filter()` em memória depois dela teria passado
   * neste teste com dados de brinquedo e falhado com um `limit` cheio — por isso as três condições
   * são cláusula de SQL.
   */
  it("candidatos ao envio: mira em um, e nem arquivado nem já enviado voltam", async () => {
    const { db, candidatosAoCadastro } = await import("@brazil-tms/db");
    const { driverPreregistrations } = await import("@brazil-tms/db/schema");
    const { eq } = await import("drizzle-orm");

    const [alvo] = await db
      .insert(driverPreregistrations)
      .values({ cpf: CPF_C, tipo: "novo" })
      .returning({ id: driverPreregistrations.id });
    const [vizinho] = await db
      .insert(driverPreregistrations)
      .values({ cpf: CPF_D, tipo: "novo" })
      .returning({ id: driverPreregistrations.id });
    criados.pre.push(alvo!.id, vizinho!.id);

    // Com id: SÓ ele. Sem isto, um clique em "João" mandaria a fila inteira.
    const mirado = await candidatosAoCadastro(50, alvo!.id);
    expect(mirado.map((c) => c.id)).toEqual([alvo!.id]);

    // Sem id: o lote traz os dois (e possivelmente outros da fila — por isso `toContain`).
    const lote = (await candidatosAoCadastro(100)).map((c) => c.id);
    expect(lote).toContain(alvo!.id);
    expect(lote).toContain(vizinho!.id);

    // JÁ ENVIADO não volta, nem mirado. É o que impede a duplicata na gerenciadora.
    await db
      .update(driverPreregistrations)
      .set({ enviadoEm: new Date() })
      .where(eq(driverPreregistrations.id, alvo!.id));
    expect(await candidatosAoCadastro(50, alvo!.id)).toEqual([]);

    // ARQUIVADO também não — quem foi descartado não pode ser criado lá por um lote noturno.
    await db
      .update(driverPreregistrations)
      .set({ arquivadoEm: new Date() })
      .where(eq(driverPreregistrations.id, vizinho!.id));
    expect(await candidatosAoCadastro(50, vizinho!.id)).toEqual([]);
  });
});
