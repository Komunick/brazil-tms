import { describe, expect, it } from "vitest";
import {
  ALL_AUDIT_ACTIONS,
  BILLING_PHASE_STATUSES,
  EXCEPTION_SEVERITIES,
  MOTIVOS_DE_NAO_CADASTRAR,
  ORIGENS,
  REASON_CODE_CATEGORIES,
  STANDARD_IMPORT_TEMPLATE,
} from "@brazil-tms/shared";
import messages from "../messages/pt-BR.json";

/**
 * Guard: next-intl forbids "." inside a message key (it is the nesting separator) and throws
 * `INVALID_KEY` at `getMessages()` — which breaks EVERY page render via RootLayout. Trip audit
 * actions are dotted strings (`trip.plan_update`), so they MUST be nested objects, not literal dotted
 * keys. This walks the whole catalog and fails on any key containing a dot. Pure unit — no DB.
 */
function dottedKeys(value: unknown, path = ""): string[] {
  if (value === null || typeof value !== "object") return [];
  const bad: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    if (key.includes(".")) bad.push(here);
    bad.push(...dottedKeys(child, here));
  }
  return bad;
}

describe("pt-BR messages", () => {
  it("has no message key containing '.' (next-intl nesting separator)", () => {
    expect(dottedKeys(messages)).toEqual([]);
  });

  it("resolves nested trip audit actions via the dot-path lookup", () => {
    const auditActions = (messages as { Trips: { auditActions: Record<string, unknown> } }).Trips
      .auditActions;
    expect((auditActions.trip as Record<string, string>).plan_update).toBe("Plano atualizado");
  });

  it("has nested + flat labels for the 006 dispatch-assignment trip actions", () => {
    const trip = (messages as { Trips: { auditActions: { trip: Record<string, string> } } }).Trips
      .auditActions.trip;
    const flat = (messages as { AuditActions: Record<string, string> }).AuditActions;
    for (const action of ["assign", "reassign", "unassign", "confirm"] as const) {
      // nested resolution (next-intl dot-path) ...
      expect(typeof trip[action]).toBe("string");
      expect(trip[action]).not.toBe("");
      // ... and the flat `AuditActions` label the global audit screen looks up via `_`.
      expect(typeof flat[`trip_${action}`]).toBe("string");
      expect(flat[`trip_${action}`]).not.toBe("");
    }
  });

  it("has nested + flat labels for the 007 exception / note / sla_rule actions", () => {
    const trip = (messages as { Trips: { auditActions: { trip: Record<string, string> } } }).Trips
      .auditActions.trip;
    const exception = (
      messages as { Trips: { auditActions: { exception: Record<string, string> } } }
    ).Trips.auditActions.exception;
    const slaRule = (messages as { Trips: { auditActions: { sla_rule: Record<string, string> } } })
      .Trips.auditActions.sla_rule;
    const flat = (messages as { AuditActions: Record<string, string> }).AuditActions;

    // nested resolution (next-intl dot-path) for the 007 additions ...
    expect(typeof trip.note).toBe("string");
    for (const a of ["create", "update", "resolve", "cancel"] as const) {
      expect(typeof exception[a]).toBe("string");
      expect(exception[a]).not.toBe("");
    }
    for (const a of ["create", "update"] as const) {
      expect(typeof slaRule[a]).toBe("string");
      expect(slaRule[a]).not.toBe("");
    }
    // ... and the flat `AuditActions` labels the global audit screen looks up via `_`.
    for (const key of [
      "exception_create",
      "exception_update",
      "exception_resolve",
      "exception_cancel",
      "trip_note",
      "sla_rule_create",
      "sla_rule_update",
    ] as const) {
      expect(typeof flat[key]).toBe("string");
      expect(flat[key]).not.toBe("");
    }
  });

  it("has nested + flat labels for the 008 document / requirement / type / rate / billing actions", () => {
    const a = (
      messages as {
        Trips: {
          auditActions: {
            document: Record<string, string>;
            document_requirement: Record<string, string>;
            document_type: Record<string, string>;
            rate: Record<string, string>;
            billing_item: Record<string, string>;
            billing: Record<string, string>;
          };
        };
      }
    ).Trips.auditActions;
    const flat = (messages as { AuditActions: Record<string, string> }).AuditActions;

    // Nested resolution (next-intl dot-path) for the twelve 008 additions.
    for (const k of ["upload", "verify", "waive", "archive"] as const) {
      expect(a.document[k]).toBeTruthy();
    }
    for (const k of ["create", "update"] as const) {
      expect(a.document_requirement[k]).toBeTruthy();
      expect(a.document_type[k]).toBeTruthy();
      expect(a.rate[k]).toBeTruthy();
    }
    expect(a.billing_item.update).toBeTruthy();
    expect(a.billing.export).toBeTruthy();

    // Flat `AuditActions` (global audit screen lookup via action.replaceAll('.','_')).
    for (const key of [
      "document_upload",
      "document_verify",
      "document_waive",
      "document_archive",
      "document_requirement_create",
      "document_requirement_update",
      "document_type_create",
      "document_type_update",
      "rate_create",
      "rate_update",
      "billing_item_update",
      "billing_export",
    ] as const) {
      expect(typeof flat[key]).toBe("string");
      expect(flat[key]).not.toBe("");
    }
  });

  it("has an AuditActions label for EVERY audit action (global screen uses action.replaceAll('.','_'))", () => {
    const labels = (messages as { AuditActions: Record<string, string> }).AuditActions;
    const missing = ALL_AUDIT_ACTIONS.filter((action) => {
      const key = action.replaceAll(".", "_");
      return typeof labels[key] !== "string" || labels[key] === "";
    });
    expect(missing).toEqual([]);
  });

  // ---- feature 009 — Reports + AuditView localization coverage (FR-018 / SC-006) -----------------

  it("has the 009 Reports and AuditView namespaces", () => {
    const m = messages as Record<string, unknown>;
    expect(typeof m.Reports).toBe("object");
    expect(typeof m.AuditView).toBe("object");
    expect((m as { Nav: Record<string, string> }).Nav.reports).toBeTruthy();
  });

  it("Reports has the screen-shell keys the components look up", () => {
    const r = (messages as { Reports: Record<string, Record<string, string> | string> }).Reports;
    for (const k of ["title", "subtitle", "period", "provisionalLabel", "loadError", "empty"]) {
      expect(typeof r[k]).toBe("string");
      expect(r[k]).not.toBe("");
    }
    const tabs = r.tabs as Record<string, string>;
    for (const k of ["sla", "exceptions", "billingReadiness"]) expect(tabs[k]).toBeTruthy();
    const filters = r.filters as Record<string, string>;
    for (const k of ["customer", "lane", "from", "to", "groupBy", "all", "clear"]) {
      expect(filters[k]).toBeTruthy();
    }
  });

  it("Reports.categoryValue covers every reason-code category (no raw token in the exception report)", () => {
    const cat = (messages as { Reports: { categoryValue: Record<string, string> } }).Reports
      .categoryValue;
    const missing = REASON_CODE_CATEGORIES.filter(
      (c) => typeof cat[c] !== "string" || cat[c] === "",
    );
    expect(missing).toEqual([]);
  });

  it("Reports.severityValue covers every exception severity", () => {
    const sev = (messages as { Reports: { severityValue: Record<string, string> } }).Reports
      .severityValue;
    const missing = EXCEPTION_SEVERITIES.filter((s) => typeof sev[s] !== "string" || sev[s] === "");
    expect(missing).toEqual([]);
  });

  it("Reports.billing covers every billing-phase status", () => {
    const billing = (messages as { Reports: { billing: Record<string, string> } }).Reports.billing;
    const missing = BILLING_PHASE_STATUSES.filter(
      (s) => typeof billing[s] !== "string" || billing[s] === "",
    );
    expect(missing).toEqual([]);
    for (const k of ["completedMissingDocuments", "pctReadyWithin24h", "customer"]) {
      expect(billing[k]).toBeTruthy();
    }
  });

  it("AuditView covers the §21.5 entity-type presets the audit screen renders", () => {
    const view = (messages as { AuditView: { presets: Record<string, string> } }).AuditView;
    for (const k of ["all", "trip", "exception", "document", "billing", "export", "user"]) {
      expect(view.presets[k]).toBeTruthy();
    }
  });

  // ---- slice 013 — predefined import template (FR-007 / FR-012) -----------------------------------

  it("Imports has the provisional notice and the template picker strings (INVERTED)", () => {
    const imports = (messages as { Imports: Record<string, unknown> }).Imports;
    // FR-007: the always-visible provisional banner copy.
    expect(typeof imports.provisionalNotice).toBe("string");
    expect(imports.provisionalNotice).not.toBe("");
    // INVERTED (2026-08-15): 004 shipped the picker hidden and this test asserted its strings were
    // gone. The picker is back because the input is now the CUSTOMER's own workbook — the standard
    // format stays the default, offered as one of the options.
    for (const key of ["template", "templateStandard", "templateHint"]) {
      expect(typeof imports[key], `Imports.${key}`).toBe("string");
      expect(imports[key]).not.toBe("");
    }
    // Still dead: the strings of the OLD control (a required picker with its own empty state).
    expect(imports.selectTemplate).toBeUndefined();
    expect(imports.noTemplates).toBeUndefined();
  });

  it("Imports.expectedColumns covers every standard-format column (download + panel guidance)", () => {
    const imports = (messages as { Imports: Record<string, unknown> }).Imports;
    for (const k of [
      "downloadSample",
      "sampleFileName",
      "expectedFormatTitle",
      "expectedFormatSubtitle",
      "expectedFormatShow",
      "expectedFormatHide",
      "expectedFormatRequired",
      "expectedFormatExample",
      "expectedFormatNote",
    ]) {
      expect(typeof imports[k], `Imports.${k}`).toBe("string");
      expect(imports[k]).not.toBe("");
    }
    // Every column the worker maps must have a pt-BR label + example so the helper never shows a raw
    // key or an empty cell (and the sample-CSV row is fully populated).
    const cols = (imports.expectedColumns ?? {}) as Record<
      string,
      { label?: string; example?: string }
    >;
    for (const m of STANDARD_IMPORT_TEMPLATE.columnMappings) {
      expect(typeof cols[m.source]?.label, `label for ${m.source}`).toBe("string");
      expect(cols[m.source]?.label).not.toBe("");
      expect(typeof cols[m.source]?.example, `example for ${m.source}`).toBe("string");
      expect(cols[m.source]?.example).not.toBe("");
    }
    // Inverse: no stray expectedColumns key without a matching standard-format column (refactor guard).
    for (const key of Object.keys(cols)) {
      const known = STANDARD_IMPORT_TEMPLATE.columnMappings.some((m) => m.source === key);
      expect(known, `unexpected expectedColumns key: ${key}`).toBe(true);
    }
  });

  // ---- fatia 028, etapa 5 — o que impede o envio, dito em português -------------------------------

  /**
   * A fila mostra o que FALTA para o cadastro sair. Sem rótulo, o selo diria `sem_seguranca_cnh` a
   * quem está com a CNH na mão procurando "nº de segurança" — e a tela deixaria de ser o lugar onde
   * o problema se resolve.
   *
   * O componente cai no código cru quando não acha a chave, então isto nunca quebra a tela; quebra
   * o build, que é onde a falta deve aparecer.
   */
  it("PreCadastros.faltando covers every reason the send can be blocked (no raw code in the queue)", () => {
    const rotulos = (messages as { PreCadastros: { faltando: Record<string, string> } })
      .PreCadastros.faltando;
    const missing = MOTIVOS_DE_NAO_CADASTRAR.filter(
      (m) => typeof rotulos[m] !== "string" || rotulos[m] === "",
    );
    expect(missing).toEqual([]);
    // Inverse: a label with no reason behind it is a reason that was renamed and left a ghost.
    for (const key of Object.keys(rotulos)) {
      const known = (MOTIVOS_DE_NAO_CADASTRAR as readonly string[]).includes(key);
      expect(known, `unexpected faltando key: ${key}`).toBe(true);
    }
  });

  it("PreCadastros has the review-screen strings (the only path to the gerenciadora)", () => {
    const p = (messages as { PreCadastros: Record<string, unknown> }).PreCadastros;
    for (const k of [
      "conferir",
      "ver",
      "conferirTitulo",
      "voltarAFila",
      "salvar",
      "salvo",
      "nadaFalta",
      "enviarParaGerenciadora",
      "enviado",
      "enviadoEm",
      "envioPedido",
      "envioFalhou",
      "envioRecusado",
      "faltam",
    ]) {
      expect(typeof p[k], `PreCadastros.${k}`).toBe("string");
      expect(p[k]).not.toBe("");
    }
    /**
     * INVERTIDO em 30/08: a lista TINHA um botão de enviar, e ele permitia mandar um cadastro à
     * gerenciadora sem nunca ter olhado o documento. O envio agora só existe na conferência, e esta
     * asserção é o que impede a chave de voltar sozinha num "conserto" de string órfã.
     */
    expect(p.enviar).toBeUndefined();
  });

  /**
   * Todo campo que a conferência edita precisa de rótulo: o componente cai no nome cru da chave, e
   * `numeroSeguranca` acima de um campo de texto não diz a ninguém o que procurar na CNH.
   */
  /**
   * A TELA QUE GASTA precisa de todos os seus textos: um rótulo faltando ali vira uma chave crua
   * numa caixa de diálogo cuja confirmação custa dinheiro. É o pior lugar do sistema para a pessoa
   * hesitar sobre o que está lendo.
   */
  /**
   * Os cinco botoes de copiar da Minha Programacao (31/08). O rotulo vira o `aria-label` e o
   * `title`: sem ele, quem usa leitor de tela ouve "botao" cinco vezes na mesma linha, e quem passa
   * o mouse nao descobre o que cada um copia.
   */
  it("Programacao has every copy-button label", () => {
    const p = (messages as { Programacao: Record<string, unknown> }).Programacao;
    for (const k of ["copiarLh", "copiarMotorista", "copiarCpf", "copiarTelefone", "copiarPlaca"]) {
      expect(typeof p[k], "Programacao." + k).toBe("string");
      expect(p[k]).not.toBe("");
    }
  });

  it("PreCadastros has every string of the paid pesquisa dialog", () => {
    const p = (messages as { PreCadastros: Record<string, unknown> }).PreCadastros;
    for (const k of [
      "pedirPesquisa",
      "pesquisaTitulo",
      "pesquisaAviso",
      "pesquisaVinculo",
      "pesquisaVinculoF",
      "pesquisaVinculoA",
      "pesquisaVinculoT",
      "pesquisaOpcoes",
      "pesquisaOpcao_expressa",
      "pesquisaOpcao_pesquisaPlus",
      "pesquisaOpcao_biometrica",
      "pesquisaConfirmar",
      "pesquisaPedida",
      "pesquisaFalhou",
    ]) {
      expect(typeof p[k], `PreCadastros.${k}`).toBe("string");
      expect(p[k]).not.toBe("");
    }
    // O aviso de custo tem de DIZER que custa — é a única proteção antes do clique.
    expect(String(p.pesquisaAviso).toUpperCase()).toContain("COBRAD");
  });

  it("PreCadastros.campo covers every field the review screen edits", () => {
    const p = (
      messages as { PreCadastros: { campo: Record<string, string>; origem: Record<string, string> } }
    ).PreCadastros;
    for (const c of [
      "nome",
      "cpf",
      "dataNascimento",
      "sexo",
      "nomeMae",
      "cidadeNatal",
      "ufNatal",
      "rg",
      "orgaoEmissorRg",
      "ufEmissorRg",
      "numeroRegistro",
      "categoria",
      "validade",
      "primeiraHabilitacao",
      "numeroFormulario",
      "numeroSeguranca",
      "renach",
      "cep",
      "logradouro",
      "numero",
      "complemento",
      "bairro",
      "cidade",
      "uf",
      "celular",
      "possuiMopp",
      "validadeMopp",
    ]) {
      expect(typeof p.campo[c], `PreCadastros.campo.${c}`).toBe("string");
      expect(p.campo[c]).not.toBe("");
    }
    // E as cinco procedências — o selo ao lado do campo é o que torna a conferência rápida.
    for (const o of ORIGENS) {
      expect(typeof p.origem[o], `PreCadastros.origem.${o}`).toBe("string");
      expect(p.origem[o]).not.toBe("");
    }
  });
});
