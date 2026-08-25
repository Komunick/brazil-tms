# Specification Quality Checklist: Pré-SM criada sozinha ao atribuir

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

## Notas da validação

Uma iteração: os itens passaram na primeira leitura. O que foi conferido, e como:

**Vazamento técnico**, verificado por busca no arquivo e não a olho: nomes de método, de tabela e de
coluna (`setPreSMdeModelo`, `portal_commands`, `ownership_type`, `CNPJProprietario`, fila, worker,
migração) aparecem **zero vezes** no corpo. Ficam só na linha de **Input**, como referência de
origem, e em `docs/PROPOSTA-PRE-SM.md`. O texto fala de "a gerenciadora", "o modelo da rota" e "o
vínculo do recurso" — que é como quem decide o negócio chama essas coisas.

**Nenhum `[NEEDS CLARIFICATION]` restou**, e não por omissão minha: as três decisões que costumariam
ficar em aberto — o vínculo A/F/T, o que fazer sem CPF e o que fazer sem modelo — foram decididas com
o usuário **antes** desta especificação existir, e estão registradas na proposta. Uma especificação
sem perguntas costuma ser sinal de que as perguntas foram evitadas; aqui elas foram feitas antes.

**Os números não são estimados.** Os que aparecem nos critérios de sucesso (84% das viagens com
modelo, 81% com CPF) vêm de medição em produção em 25/08/2026, registrada na proposta com o método.

## Riscos que o plano precisa endereçar

Não são falhas da especificação, mas seguem anotados para não se perderem:

1. **Não há ambiente de teste** (`USUARIO INVALIDO` em homologação, medido). O plano precisa dizer
   como exercitar a escrita contra o sistema real sem sujá-lo, e o cancelamento é a única saída.
2. **A migração do vínculo esbarra num CHECK existente** que amarra "de fora" a ter transportadora.
   Abrir o valor em dois obriga a reescrever a regra, ou o banco recusa.
3. **Duplicata custa dinheiro**: a gerenciadora cobra por solicitação. A garantia de "no máximo uma"
   (FR-002) precisa de mecanismo real, não de boa intenção — e o gatilho é uma fila que pode
   reprocessar.
