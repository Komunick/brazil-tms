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

---

## Rodada de `/speckit-analyze` — 31/08

Oito achados, todos corrigidos antes de qualquer código. Os três que valiam a rodada:

**F1 (CRITICAL) — "8 cargos semeados" era impossível.** `ROLE_PERMISSIONS` é `Record<Role, …>` e
`Role` tem **7** valores; `customer_viewer` está no enum do banco (8 valores) e **não está no
catálogo**. Semear 8 a partir dele não teria de onde tirar o oitavo, e criá-lo à mão violaria o
FR-017 — que o próprio `data-model.md` afirmava três parágrafos adiante. Corrigido para **7** nos
cinco lugares. Teria virado uma migração de produção, escrita à mão, semeando o acesso de 34 pessoas.

**F2 (HIGH) — a metade SERVIDOR do FR-006 não tinha task.** As tarefas cobriam esconder o item no
menu e conferir que ele encolhe; nada cobria *"o servidor MUST recusar o acesso direto ao endereço"*,
que é o cenário 2 da US1 e a parte que o requisito chama de "esconder no menu nunca é a única
defesa". Virou a T035a.

**F3 (HIGH) — usuário NOVO podia nascer sem cargo.** `cargo_id` é NULL de propósito (research §5,
por causa do app anterior), e a única tarefa de FR-011 tratava de apagar cargo. A criação de usuário
não aparecia em lugar nenhum — FR-011 seria falso para todo cadastro feito depois da virada. Virou a
T035b, e o invariante I2 do `data-model.md` passou a dizer honestamente que **é a aplicação que o
sustenta**, não o banco, até o `NOT NULL` de uma fatia futura.

Os outros cinco: caminho do script divergente em quatro artefatos (F4), auditoria de selo prevista e
sem tarefa (F5), duas armadilhas ausentes do quickstart (F6), "admin" usado onde se queria
`manage_users` — que é justamente a distinção que esta fatia cria (F7), e FR-016 sem afirmação (F8).

### Dois fatos acrescentados pelo usuário na mesma rodada

**O motivo que olha para a frente**: vão entrar sistemas de outros setores no TMS. Os 20
administradores são o sintoma de hoje; o alicerce é o que precisa aguentar um setor que ainda não
existe. Está em `spec.md` e `plan.md`, porque muda o critério de "pronto".

**A conta mestre** `victorti@braziltransports.com.br` (conferida em produção: `admin`, ativa) →
FR-017a e T013a. **Conferência, não regra**: o endereço não entra no código de autorização, porque
seria um segundo caminho de decisão e uma conta privilegiada por e-mail escrito em código sobrevive a
quem saiu da empresa.
