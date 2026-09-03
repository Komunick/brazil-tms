# Specification Quality Checklist: Motoristas disponíveis

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-03
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

**16/16.** Nenhum marcador em aberto — as duas perguntas que existiam foram decididas pelo usuário
**antes** da spec ser escrita, e por isso entraram como decisão e não como pendência:

1. **Até quando o finalizado fica na aba** → a janela decide quem ENTRA, só viagem nova faz SAIR, com
   corte de sete dias parado. Escolhida contra a janela estrita de 2 dias (que perderia 20 motoristas
   livres) e contra a permanência sem corte (que traria 72 parados há mais de 30 dias).
2. **O motorista livre que a atribuição vai recusar** → aparece marcado como impedido, não escondido.

**Duas correções feitas durante a validação**, ambas por falharem "critérios mensuráveis" e
"histórias independentes":

- **SC-008** dizia "sem espera perceptível", que não é conferível. Passou a **menos de 2 segundos**
  com o volume real (~130 motoristas na janela).
- A justificativa da **US2** dizia que ela "depende da P1 estar de pé", o que contradiz a exigência de
  história independentemente testável. Reescrita: a ordem é de urgência (quem já chegou antes de quem
  vai chegar), não de dependência técnica — a US2 se testa sozinha.

**Sobre "sem detalhe de implementação"**: a spec afirma que a fatia não cria tabela, coluna nem
migração, e que o estado NÃO é guardado. Isso é fronteira de escopo e regra de negócio — "a lista é
uma conclusão, não um registro" —, e é justamente o que impede a repetição do erro que a fatia 030
documentou: copiar para uma coluna nossa um estado que é do portal.

**Certificação**: os números da spec foram medidos na produção em 03/09, não estimados — 26 de 26
casos de `Completed`, 772 de 772 viagens com as duas janelas, 15 motoristas com mais de uma viagem
aberta, 20 chegados ontem sem viagem nova, 4 de 36 finalizados sem cadastro ativo.
