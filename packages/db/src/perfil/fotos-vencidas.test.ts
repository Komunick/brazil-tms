import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRAZO_DA_FOTO_DIAS } from "./fotos-vencidas";

/**
 * O ALVO DO DESCARTE (fatia 029, FR-024) — conferido na CONSULTA, porque é ela que decide.
 *
 * ── POR QUE LER O SQL, E NÃO CHAMAR A FUNÇÃO ──────────────────────────────────────────────────
 *
 * Chamar `fotosVencidas` exigiria banco, e o que precisa ser trancado aqui não é o resultado — é a
 * FORMA da pergunta. As três condições precisam estar todas lá, e a ausência de qualquer uma apaga
 * a foto de quem não devia:
 *
 *   sem `entity_type = 'user'`      → apagaria documento de motorista e de veículo
 *   sem `status = 'disabled'`       → apagaria a foto de quem está trabalhando
 *   sem `desativado_em is not null` → apagaria a de quem foi reativado
 *
 * Nenhuma delas quebra em teste de unidade; todas quebram em produção, uma vez, e sem volta —
 * porque este é o único ponto da fatia que apaga de verdade.
 */
const SQL = readFileSync(join(__dirname, "fotos-vencidas.ts"), "utf8");

describe("o alvo do descarte é estreito", () => {
  it("só documento de PERFIL, e de usuário", () => {
    expect(SQL).toContain("rd.entity_type = 'user'");
    expect(SQL).toContain("rd.doc_type = 'foto_perfil'");
  });

  it("só quem está DESATIVADO", () => {
    // Sem esta condição, a data sozinha pegaria linhas antigas de quem já voltou a trabalhar.
    expect(SQL).toContain("u.status = 'disabled'");
  });

  it("e a REATIVAÇÃO tira do alvo — a coluna precisa estar preenchida", () => {
    /**
     * É assim que a reativação "para o relógio" sem nenhuma regra especial: `desativado_em` é zerado
     * ao reativar, e uma linha com a coluna nula nunca entra nesta consulta.
     *
     * Sem o `is not null`, quem foi reativado teria `desativado_em` nulo e a comparação
     * `null < now() - 90 dias` seria NULL — que o Postgres trata como falso, e por sorte funcionaria.
     * Depender de sorte numa consulta que APAGA não é aceitável.
     */
    expect(SQL).toContain("u.desativado_em is not null");
    expect(SQL).toContain("u.desativado_em < now() - make_interval");
  });

  it("o prazo é 90 dias, e ele é parâmetro — não número solto no SQL", () => {
    // Parâmetro para o teste poder passar outro valor, e para o prazo ter UM lugar. Um `90` escrito
    // dentro da consulta seria a segunda definição do mesmo prazo.
    expect(PRAZO_DA_FOTO_DIAS).toBe(90);
    expect(SQL).toContain("make_interval(days => ${dias})");
  });
});

describe("o descarte é registrado", () => {
  it("audita com a ação própria e o motivo", () => {
    // É a ÚNICA exclusão real desta fatia. O princípio III pede rastro justamente porque nada mais
    // aqui apaga: sem a linha de auditoria, a foto some e não há como saber que existiu.
    expect(SQL).toContain('action: "user.foto_descartada"');
    expect(SQL).toContain("reason:");
  });

  it("guarda a chave do objeto no `previousValue`", () => {
    // Se o objeto sobreviver no bucket por falha do armazenamento, é por esta chave que alguém o
    // encontra depois. Sem ela, o rastro diz que apagou e não diz o quê.
    expect(SQL).toContain("fileStorageKey: foto.fileStorageKey");
  });
});
