# Quickstart — pré-cadastro de motorista parceiro

Como exercitar cada etapa sem esperar o evento, e sem gastar nada com a gerenciadora.

## Antes de tudo: o que custa e o que não custa

| Ação | Custa? |
|---|---|
| Tudo das etapas 1 a 4 | **Não.** Nada sai do TMS |
| `getTabela`, `getCidades`, `getRotas`, `getCliente` | Não — são leitura |
| `setMotorista` | **A confirmar** com a gerenciadora |
| `setSolicitacaoPesquisaConsulta` | **Sim.** É cobrada por solicitação |

Não há ambiente de homologação: `Ambiente: "Homologacao"` responde `CodErro 100 — USUARIO INVALIDO`,
medido em 25/08. **Toda escrita é em produção**, e por isso as etapas 5 em diante têm botão humano.

## Etapa 1 — a rota que recebe

Sem formulário nenhum, direto no `curl`. É assim que se sabe que a rota está de pé antes de o outro
repositório existir:

```bash
curl -X POST https://tmsdev.braziltransports.com.br/api/publico/pre-cadastro \
  -H "Origin: https://braziltransports.com.br" \
  -F "nome=MOTORISTA DE TESTE" \
  -F "cpf=123.456.789-00" \
  -F "celular=71999998888" \
  -F "cep=42850-000" \
  -F "possuiMopp=nao" \
  -F "possuiToxicologico=nao" \
  -F "ciencia=true" \
  -F "cnh=@cnh.jpg" \
  -F "comprovante=@comprovante.jpg"
```

Esperado: `202` com `{"recebido": true}`.

### As quatro coisas que precisam ser verdade

**A resposta é idêntica nos três casos.** Rode o mesmo `curl` com um CPF novo, depois com o mesmo
CPF de novo, depois com o CPF de um motorista ativo. **As três respostas têm de ser iguais byte a
byte** — corpo, código e cabeçalhos. Se alguma diferir, o vazamento está aberto.

**O segundo envio não cria linha nova.** Confira no banco: um `driver_preregistrations` e dois
`driver_preregistration_submissions`.

**A validação é do servidor.** Mande um CPF com dígito errado — tem de recusar mesmo que o
formulário não tivesse validado. Mande um `.txt` no lugar da foto. Mande sem `ciencia`.

**A origem importa.** Repita sem o cabeçalho `Origin`, ou com outro valor. Tem de recusar.

## Etapa 2 — a fila

Entre no TMS, abra a tela de parceiros, e confira:

- os envios do `curl` aparecem em ordem de chegada
- novo cadastro e atualização cadastral são visivelmente diferentes
- as fotos abrem por link, e o link expira
- arquivar tira da fila **sem apagar** a linha nem os envios

## Etapa 3 — a leitura

Anexe uma CNH legível e confira que os campos aparecem preenchidos e **marcados como lidos**.

Depois faça o teste que importa mais: **anexe uma foto tremida, ou cortada.** Os campos que não
saírem têm de ficar **vazios e assinalados**. Um campo preenchido com valor inventado é o pior
desfecho possível — pior do que campo vazio, porque ninguém vai conferir o que parece certo.

## Etapa 4 — a conferência

- cada valor mostra de onde veio, e `declarado` é visivelmente diferente de `digitado`
- numa atribuição cadastral, atual × proposto aparecem lado a lado
- o CEP resolve o endereço; número e complemento continuam pedindo gente
- sem vínculo definido, o cadastro não segue

## Etapa 5 — o envio, e a primeira vez que gasta

**Com o usuário presente**, um cadastro escolhido, e o cancelamento à mão pronto caso algo saia
errado. É a mesma disciplina da fatia 027.

Confira que os **documentos foram junto** — é o bloco `Documentos` do `setMotorista`, e é o que
elimina a visita à tela da gerenciadora.

E que o toxicológico deixou a marca de **ação manual necessária**, porque a API não tem esse campo.

## Se algo der errado no dia do evento

**Cadastros não estão chegando.** Veja se a rota responde ao `curl` acima. Se responder, o problema
é do formulário, no outro repositório.

**Chegando com foto faltando.** Provavelmente o teto de tamanho: a compressão do formulário não está
acontecendo. O servidor recusa com `arquivo_grande`.

**A fila está vazia e deveria ter gente.** Confira a origem permitida — se o site tiver mudado de
endereço, a rota recusa tudo, e o formulário mostra erro genérico.
