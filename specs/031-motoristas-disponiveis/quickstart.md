# Quickstart: Motoristas disponíveis

**Feature**: 031 · **Date**: 2026-09-03

Como conferir a fatia — **sem viagem de mentira e sem escrever nada em lugar nenhum**.

---

## O ponto de partida: o tmsdev não tem viagem do dia

O banco do tmsdev parou de ser alimentado em 29/08; os robôs escrevem em **produção**. Uma lista
vazia lá é **falta de dado, não regressão**. Por isso a conferência é feita em três lugares
diferentes, e cada um prova uma coisa que os outros não provam.

---

## 1. A regra, sem banco (`pnpm vitest run packages/shared`)

A derivação pura é onde a regra se prova. O que precisa estar coberto:

- **A virada do dia em São Paulo.** Uma conclusão às 23h30 de hoje em São Paulo é 02h30 de amanhã em
  UTC. O teste tem de falhar se alguém trocar o fuso — e para isso precisa de um caso **dos dois
  lados** da meia-noite, não só de um horário comercial.
- **O corte de sete dias**: o sétimo dia ainda aparece, o oitavo não.
- **Cancelada nunca vira FINALIZADO** (I4).
- **Hoje e amanhã entram; depois de amanhã não.**

## 2. A consulta, contra a produção, **em modo leitura**

A consulta é `select` puro. Rodá-la contra a produção não escreve nada e é a única forma de conferir
o que importa:

```sql
-- o custo, e o formato do plano
explain (analyze, buffers) <a consulta>;
-- esperado: Execution Time abaixo de 50 ms (medido em 03/09: 10,9 ms), buffers em "shared hit"
```

E três conferências de conteúdo:

```sql
-- (a) nenhum motorista com viagem aberta aparece como disponível  [SC-004]
-- (b) todo motorista da lista é a MAIOR conclusão dele            [I3]
-- (c) duas execuções seguidas devolvem a mesma lista, na mesma ordem  [I5]
```

A (a) tem alvo certo: os **15 motoristas** com mais de uma viagem aberta ao mesmo tempo.

## 3. A tela

Abrir `/motoristas-disponiveis` e conferir contra a planilha PROGRAMAÇÃO SHOPEE FROTA do dia:

- as colunas são as mesmas, na mesma leitura;
- quem está FINALIZADO na planilha está FINALIZADO na aba;
- um motorista com carreta mostra **as duas** placas; um sem carreta mostra o campo **vazio**, e não
  a placa do cavalo repetida;
- as duas contagens do cabeçalho batem com o número de linhas de cada tipo.

---

## O que NÃO fazer

1. **Não construir sobre `trip_assignments`.** Esconde 67 motoristas na janela e aponta para a pessoa
   errada em 18 casos. A fonte é o portal (R1).
2. **Não escolher "a última viagem" pela data de criação nem pela "única aberta".** 15 motoristas têm
   mais de uma aberta ao mesmo tempo (R2).
3. **Não escrever nada.** A fatia não tem caminho de escrita (I1). Se apareceu um `update`, algo saiu
   do lugar.
4. **Não guardar "disponível" em coluna nossa** (I2, FR-016).
5. **Não escrever um segundo separador de placa.** `placasDoPortal` já existe e já é testada.
6. **Não contar dias em UTC.** Fuso de São Paulo, sempre (R3).
7. **Não varrer só a janela da aba.** A varredura de 8 dias existe para achar a última viagem **antes**
   do recorte; varrer só a janela faria a "última" ser a última *dentro dela* (armadilha 7).
8. **Não "consertar" a permanência de quem chegou ontem.** É exceção declarada, decidida pelo usuário:
   a janela decide quem entra, só viagem nova faz sair.

---

## O que sobra para o usuário

A conferência final na tela, com a planilha do dia ao lado — é ela que diz se a aba pode substituir a
digitação. Nada nesta fatia é irreversível, nada gasta, e nada escreve no portal do cliente.
