# Proposta — o cadastro do motorista novo

**Estado: proposta.** Nada implementado.

Escrito em 2026-08-28, depois de ver a tela da Raster ao vivo, ler o manual da Integra 14.0 e medir o
volume com o usuário.

---

## O que acontece hoje

O motorista novo manda os documentos. Um funcionário abre `cadastro.rastergr.com.br`, digita o
formulário inteiro à mão, pede a pesquisa, e depois **volta na tela deles** para ver se a auditoria
aprovou. Só então o motorista existe para o portal do cliente.

**São mais de 5 por dia** (usuário, 28/08). Mais de 150 por mês, cada um com vinte e poucos campos.
Isso não é uma tarefa — é um cargo.

## A Raster fala a mesma API que a Logae

Não é suposição: as chamadas da própria página deles saem para `release.logae.com.br`. É a plataforma
que o TMS já integra, com o cliente que já existe em `workers/lib/integra/cliente.ts`.

Três métodos cobrem o processo inteiro:

| Método | Página | O que faz |
|---|---|---|
| `setMotorista` | 52 | Cria a pessoa no cadastro |
| `setSolicitacaoPesquisaConsulta` | 144 | Pede a pesquisa — **é o que custa** |
| `getResultadoPesquisaConsulta` | 150 | Lê o retorno da auditoria |

E o retorno da solicitação traz duas coisas que resolvem pedaços grandes do problema sozinhas:

**`PhotocheckUrl`** — *"link para o condutor executar a validação do photocheck"*, com data de
expiração. A API devolve um endereço **para o motorista abrir**. A parte de "o próprio motorista
fazendo" já existe lá dentro; falta só entregar o link a ele.

**`Situacao`** — `AP` aguardando · `AD` adequado ao risco · `NA` inconclusivo · `EX` expirado. É o
retorno da auditoria, legível por API. Ninguém precisa ficar olhando a tela da Raster.

## O que a API não dá

**O toxicológico não existe no manual.** Zero ocorrências em 25.822 linhas. Ele está na tela deles —
"Possui" e "Vencimento" — e não em método nenhum. Fica de fora da automação enquanto não houver
resposta da gerenciadora.

## As quatro abas da tela deles, e para onde cada uma vai

A tela de cadastro da Raster tem quatro abas. Três caem inteiras no `setMotorista`:

| Aba | Para onde vai |
|---|---|
| Dados gerais | `setMotorista` — CPF, nome, sexo, nascimento, RG, profissão, endereço |
| Documentação | `setMotorista` — naturalidade, nome da mãe, MOPP, CNH |
| Telefones | `setMotorista` — campos `Telefone` e `Celular` |
| **Documentos** | **não tem método** |

**A quarta é uma lacuna medida, não uma suspeita.** O manual tem 64 métodos e só dois citam
documento: `getDocumentoPesquisaConsulta` (que **lê**) e `setIncluirDocumentoViagem` (que anexa a uma
**viagem**, não a uma pessoa). Nenhum método com anexo, arquivo, foto ou imagem no nome.

Ou os arquivos são opcionais para a pesquisa — e então guardamos no TMS só para conferência — ou
são exigidos, e essa parte continua na tela deles. **Não sei qual, e é pergunta para a gerenciadora.**

## De onde sai cada campo

O achado que sustenta a proposta: **quase tudo que a pesquisa exige está impresso na CNH.**

| Origem | Campos |
|---|---|
| **A CNH** | CPF · Nome · Sexo · Nascimento · RG e órgão emissor · **Nome da mãe** · Cidade natal · Nº registro · Nº formulário · Nº segurança · Renach · UF de emissão · Categoria · Validade · 1ª habilitação |
| **O CEP** | Endereço · Bairro · Cidade · **código IBGE** |
| **Digitado** | Celular · MOPP (sim/não e vencimento) |

Duas observações que economizam trabalho:

1. **São dois códigos IBGE** — cidade natal e cidade de residência. É a mesma ponte que a 027 já vai
   construir com o `getCidades`.
2. **O ViaCEP devolve o código IBGE junto com o endereço.** Um CEP preenche rua, bairro, cidade e o
   código, de graça, sem tabela nenhuma.

E o pedido da pesquisa é minúsculo perto disso:

```
CodFilial · TipoIdentificacao=P · Identificacao=CPF · Vinculo=F/A/T · Expressa · PesquisaPlus
```

**O vínculo A/F/T é o mesmo da 026.** Terceira vez que aquele campo se paga.

## O desenho

### Por que NÃO começar pelo formulário do motorista

Foi a minha primeira ideia e ela está errada. O motorista teria de informar **número de formulário da
CNH, número de segurança e Renach** — três números que ninguém sabe de cor e que se escondem no
documento. Um formulário assim, no celular, é abandonado.

A leitura do documento não é enfeite: **é o que torna o formulário do motorista viável.** Então ela
vem primeiro, e vem para uso interno, onde um erro não custa a paciência de ninguém de fora.

### A ordem proposta

**Etapa 1 — a fila, com leitura de documento. Uso interno.**
O funcionário joga a foto que já recebe hoje. A leitura preenche. Ele confere lado a lado com o
documento e confirma. **Nada muda para o motorista** e a digitação acaba no primeiro dia.

**Etapa 2 — o envio.** `setMotorista` cria a pessoa; a solicitação pede a pesquisa. É a primeira que
gasta, e o botão é de uma pessoa, como na aba GR.

**Etapa 3 — o retorno chega sozinho.** Um job lê o `getResultadoPesquisaConsulta` e o status aparece
no TMS. O `PhotocheckUrl` vai para o motorista por WhatsApp assim que a solicitação responde.

**Etapa 4 — o link para o motorista.** O mesmo formulário, agora aberto para ele: fotografa a CNH e o
comprovante, confirma o celular. Curto, porque a leitura já faz o grosso. Link de uso único, sem
login, sem app.

### Por que a conferência humana fica

**A pesquisa é cobrada por solicitação.** Um CPF lido errado não é retrabalho — é dinheiro gasto
pesquisando outra pessoa, e uma auditoria que volta sobre quem não é o motorista.

E a própria Raster não confia na leitura dela sozinha: a IA preenche e **espera alguém confirmar**. É
a decisão de produto deles, tomada com mais dados do que eu tenho.

## O que se reaproveita

- O cliente da Integra e seu tratamento de `CodErro` — `workers/lib/integra/cliente.ts`
- O vínculo A/F/T e as migrações `0046`/`0047` da 026
- A ponte cidade → IBGE da 027
- O padrão da aba GR: fila, o que falta dito na linha, botão travado com motivo, envio um a um
- A credencial vive **só no worker**; toda escrita é job, nunca rota

## Dados pessoais

Documento com foto, CPF, RG, filiação e endereço. Bucket privado no Supabase Storage, com prazo de
descarte definido — a foto serve para conferir, não para arquivar. Vale decidir o prazo antes de
guardar a primeira.

## Fora de escopo

Renovação · Veículos/Carretas (a mesma API serve, mas é outra fatia) · pesquisa em conjunto ·
o toxicológico · qualquer acesso do motorista ao TMS.

## O que já foi medido (28/08, leitura, sem gastar)

**A filial é uma só, e é a mesma.** `getTabela(FILIAIS)` devolve exatamente uma linha:

```
Codigo 9332  ·  03571231000143-BRAZIL TRANSPORTS LTDA
```

É o mesmo CNPJ que a tela da Raster mostra no campo Filial, e o mesmo `CodFilial` já usado na
Pré-SM. Não há ambiguidade a resolver: existe uma filial, e todo mundo aponta para ela.

**`CodProfissao` = 30 é MOTORISTA**, confirmado contra `getTabela(PROFISSOES)` — bate com o que o
manual diz na página 52.

**Não existe catálogo de tipos de pesquisa.** `Expressa`, `PesquisaPlus` e `PesquisaBiometrica` são
campos S/N no próprio pedido, não códigos de uma tabela. A escolha é de negócio, não de cadastro.

**`getCliente` não serve aqui**: exige um CNPJ e responde `CodErro 109 — O CADASTRO NAO EXISTE` para o
nosso. Ele consulta os *clientes* da transportadora, não a própria empresa.

## As perguntas em aberto, com dono

1. ~~**O `setMotorista` custa, ou só a solicitação?**~~ **RESPONDIDO em 2026-08-29, pelo usuário:
   cadastrar é DE GRAÇA; só a solicitação de pesquisa é cobrada.** A etapa de cadastro PODE ser
   exercitada contra a produção — com a ressalva de que cada chamada cria uma pessoa real no sistema
   deles, então com CPF de gente que vai mesmo ser cadastrada, nunca inventado. Ver a decisão D7 em
   `specs/028-fila-cadastro-motorista/plan.md`.
2. **`Expressa` / `PesquisaPlus` / `PesquisaBiometrica` — qual combinação usar por motorista?**
   São níveis com preços diferentes e não há tabela que decida por nós. *Usuário.*
3. **O toxicológico trava a liberação?** Se travar, alguém continua tratando à mão — ele não existe
   na API. *Usuário.*
4. **Os arquivos da aba Documentos são exigidos pela pesquisa?** Não há método para anexá-los
   a uma pessoa. Se forem exigidos, essa parte não automatiza. *Gerenciadora.*
5. **Depois de aprovado, o que leva o motorista ao portal — é automático?** *Usuário.*
6. **Como o motorista manda os documentos hoje?** Define por onde vai o link da Etapa 4. *Usuário.*
