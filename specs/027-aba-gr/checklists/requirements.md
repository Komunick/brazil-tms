# Specification Quality Checklist: A aba GR — a Pré-SM feita por uma pessoa

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-25
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

### Duas correções feitas na validação

**Nomes de método vazavam para a especificação.** A primeira versão citava `setPreSM`,
`setPreSMdeModelo`, `getCidades` e `getRotas` no corpo dos requisitos. São detalhe de
implementação: o que a especificação precisa dizer é *"só correspondência confirmada vale"*, não
qual método a busca. Os nomes ficaram onde pertencem — no contexto e na seção de incerteza, que
descrevem o mundo, não a solução.

**Um critério de sucesso media o sistema, não a pessoa.** Estava escrito "a chamada responde em
menos de N segundos". Virou SC-002, que mede o que interessa: **um minuto de trabalho humano** desde
abrir a aba.

### O que esta especificação deliberadamente NÃO resolve

A incerteza sobre como a solicitação se amarra à programação da gerenciadora está registrada como
pendência com dono, não como suposição. Ela não impede o planejamento: a fila, a lista do que falta
e a conferência das correspondências independem da resposta.

Registrar em vez de adivinhar é a lição direta da fatia anterior — a 026 foi inteira construída
sobre três suposições sobre a API, e as três estavam erradas.
