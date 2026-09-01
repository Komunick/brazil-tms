# Specification Quality Checklist: Aceite de oferta de spot direto no cartão

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-01
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**16 de 16.** Nenhum marcador aberto: as seis decisões de negócio foram tomadas pelo usuário em
01/09 e estão registradas como decididas, não como perguntas.

**Duas observações sobre o julgamento aplicado**, para quem revisar não achar que passaram batido:

1. **A seção Contexto cita caminhos de arquivo.** É deliberado e segue a convenção do repositório
   (`CLAUDE.md`: "Each spec must reference PRD sections/IDs rather than duplicating them"): a spec
   aponta para onde a regra já mora em vez de reescrevê-la, que é como ela envelheceria em silêncio.
   Nenhum requisito depende desses caminhos — eles são endereço, não conteúdo.

2. **FR-005 precisou ser reescrito na primeira passada.** A redação inicial dizia que "as únicas
   saídas são aceitar, ignorar e recolher" logo depois de proibir gesto que tirasse o cartão sem
   decisão — e recolher é exatamente isso. A contradição foi desfeita separando *tirar da lista* de
   *encolher*: recolher não é saída, é tamanho.

**O `/speckit-analyze` rodou DUAS vezes, e a segunda achou defeito que a primeira criou.** Vale
registrar porque é um padrão, não um acidente:

- **Primeira passada — 3 HIGH e 2 MEDIUM.** Um número aritmeticamente impossível nos casos de borda
  (a oferta chegando antes da viagem "em 16 de 98 casos, e em 82 deles…"); o FR-001 prometendo que o
  cartão fica até ser decidido, com a exceção da virada do dia declarada só no plano; e a promessa de
  que as fases 1 a 3 não mudam nada, que era falsa porque excluir as ofertas já aceitas mudaria o que
  o cartão de HOJE recebe.
- **Segunda passada — 1 HIGH, filho da correção anterior.** Ao declarar a exceção da virada do dia no
  FR-001, o **SC-002** ficou para trás afirmando uma igualdade que a exceção quebra: uma medição que
  atravessasse a meia-noite reprovaria o sistema por fazer o que foi decidido que ele faça.

**A lição, que já mordeu esta base outras vezes: corrigir uma afirmação não corrige as outras que
dependiam dela.** Requisito e critério de sucesso medem a mesma coisa por ângulos diferentes, e
consertar só um deixa o outro mentindo — sem nenhum sintoma até alguém medir.

**Números que a spec afirma e que vieram de medição em produção (01/09)**, não de estimativa —
qualquer artefato seguinte deve bater com eles:

| medida | valor |
| --- | --- |
| ordens de aceite gravadas · concluídas | 17 · 13 |
| aceites em LH vinda de oferta de spot | 11 |
| atraso entre o aviso e o aceite manual | 0 a 3 min |
| do clique à resposta do portal (396 ordens, 7 dias) | mediana 3 s · p95 5 s · máx 7 s |
| recusas, todas `131205003` | 4 de 17 |
| ofertas registradas · por dia | 132 · 5 a 10 |
| ofertas que viraram viagem no TMS | 98 de 132 |
| dessas, com a viagem disponível em até 2 min | 82 de 98 |
| ofertas dos últimos 2 dias com identificador do portal | 19 de 19 |
