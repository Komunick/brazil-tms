# Specification Quality Checklist: Pré-cadastro de motorista parceiro

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-28 · **Revisto**: 2026-08-29 (segunda reescrita)
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
- [x] Success criteria are technology-agnostic
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Consistência entre os casos que se cruzam

A revisão pediu que não restasse contradição entre seis eixos. Conferidos um a um:

| Eixo | Onde é resolvido | Sem conflito porque |
|---|---|---|
| Motorista novo | FR-015 | nasce pré-cadastro |
| Já pendente | FR-016 | anexa ao existente, preserva histórico |
| Já cadastrado | FR-017, FR-018, FR-019 | vira atualização; `drivers` intocado |
| MOPP | FR-034, FR-035 | capturado como **declarado**, conferido depois |
| Toxicológico sem API | FR-036, FR-037, FR-038 | capturado e armazenado; envio automático fora de escopo, ação manual rastreada |
| P1 × P2/P3 | US1–US3 são P1 | leitura, envio e retorno não bloqueiam o evento |

**O ponto onde as três situações de CPF poderiam ter se contradito** é a resposta da página pública:
tratar cada caso de um jeito e ainda assim responder igual. FR-013 fecha isso, e SC-004 mede.

## O furo que a revisão do usuário fechou

A versão anterior dizia que a tela pública responderia *"você já está registrado"*. Isso transformaria
o formulário numa **máquina de enumerar CPFs**: digita, descobre quem é motorista da empresa.

O item 4 da revisão fechou o vazamento de dados. Faltava o segundo furo — **a forma da resposta é
informação**. Mesmo sem exibir nada, responder diferente confirma o CPF. FR-013 exige resposta
indistinguível em conteúdo, forma e destino.

## Três coisas que entraram por causa do evento

Não estavam na lista de decisões e foram acrescentadas por risco medido:

- **Redução da imagem no navegador** (FR-007) — CNH de celular sai com 4-5 MB; 4G de estande
  derruba o upload e o cadastro se perde sem ninguém saber.
- **Contenção de envios repetidos** (FR-011) — link público circula, sem punir vinte pessoas no
  mesmo wi-fi.
- **A tela dizendo o que acontece depois** (FR-010) — não há ninguém no estande para explicar.

## O que mudou por leitura nova da API (29/08)

O manual foi relido do **PDF** com `pdftotext`, e não da conversão HTML que vinha sendo usada. A
conversão perdia conteúdo: 53 métodos contra 62.

**Duas pendências morreram:**

- O `setMotorista` tem um bloco `Documentos` (descrição, extensão, arquivo em Base64). **Há como
  anexar arquivos pela API** — a afirmação anterior de que não havia estava errada, e vinha de
  concluir a partir de uma ausência na extração.
- Há campos de fallback (`PaisEndereco`/`UFEndereco`/`CidadeEndereco` e os equivalentes de
  naturalidade) para quando o código IBGE não é conhecido. **O IBGE deixa de ser bloqueio.**

**Uma foi reconfirmada na fonte limpa:** o toxicológico não aparece em lugar nenhum do manual —
`toxicolog`, `toxico`, `exame`, `ASO` e `atestado` dão zero, enquanto `MOPP` aparece nas três linhas
esperadas. O controle prova que a busca funciona.

## Aberto para decisão do usuário

Marcado em *Pendências* e repetido aqui:

1. **O CEP como campo opcional no formulário público.** A decisão atual é pedi-lo só ao operador,
   na conferência. O motorista sabe o CEP de cor: dez segundos dele economizariam leitura de
   comprovante em cinquenta conferências.
2. **O prazo de descarte das fotos** (FR-044) continua sem número.
