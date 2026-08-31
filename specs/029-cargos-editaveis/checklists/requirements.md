# Specification Quality Checklist: Cargos editáveis, mini perfil e selos

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-31
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

### O marcador que havia foi respondido

**FR-024 — prazo de descarte da foto.** Respondido pelo usuário em 31/08: **90 dias** após a desativação,
com o relógio parando se a pessoa for reativada dentro do prazo. Ficou aberto até ser perguntado porque o
próprio requisito exige uma decisão DECLARADA — preencher com um número silencioso seria o que ele proíbe.

Entrou junto o **FR-024a**: o descarte tem de acontecer sozinho. Um prazo que depende de alguém lembrar não
é um prazo, é uma intenção.

### Duas tensões que passaram, e por que passaram

**Nomes internos citados no corpo.** A spec menciona `admin`, `dispatcher`, `customer_viewer` e o número 23
de capacidades. Não é vazamento de implementação: são os **dados medidos em produção** que justificam a
fatia, e trocá-los por descrições genéricas apagaria a evidência de que 20 de 34 pessoas são administradoras.
O texto separa o que é medição do que é requisito.

**SC-001 depende de gente, não de código.** Reduzir de 20 para 3 administradores exige que alguém revise os
cargos depois de a ferramenta existir. Ficou como critério assim mesmo porque é o desfecho que dá sentido à
fatia — entregar a ferramenta e continuar com 20 administradores seria ter falhado, ainda que todo requisito
passasse.
