# Contrato — Integra 14.2, o que esta fatia usa

Endereço: `https://integra.logae.com.br/datasnap/rest/TWebService/"<metodo>"` — o nome do método vai
**entre aspas** na URL (`%22` escapado). POST com JSON. Todo corpo leva `Ambiente`, `Login`, `Senha`
e `TipoRetorno`.

Toda resposta traz `CodErro` (**zero = sem erro**) e `MsgErro`. O corpo real vem sob `result[0]`.

> **Não há homologação para nós.** Medido em 2026-08-25: `Ambiente: "Homologacao"` responde
> `CodErro 100 — USUARIO INVALIDO`. Só `"Producao"` funciona. Ver R1 em `research.md`.


> **A referência completa da API está em `docs/INTEGRA-14.2-REFERENCIA.md`** (2026-08-25),
> extraída do manual da Logae. Este contrato descreve o recorte que ESTA fatia usa; a referência
> tem os 53 métodos com todos os campos, e é onde conferir antes de afirmar que algo não existe.
---

## `setPreSMdeModelo` — cria

Escolhido em vez do `setPreSM` completo, que exigiria espelhar cidades com código IBGE, cliente e
filial. Este pede só o que varia por viagem.

| campo | de onde vem no TMS | obrigatório |
|---|---|---|
| `CodModelo` | `pre_sm_route_models.cod_modelo` (linha confirmada) | sim |
| `PlacaVeiculo` + `VincVeiculo` | placa do portal · `ownership_type` do veículo | sim |
| `CPFMotorista1` + `VincMotorista1` | cadastro, pelo id do portal · `ownership_type` do motorista | sim |
| `CPFMotorista2` + `VincMotorista2` | segundo motorista da atribuição | não |
| `PlacaCarreta1..3` + `VincCarreta1..3` | demais placas da atribuição | não |
| `Chegada1aColeta` | janela de coleta, início ("ETA ORIGEM") | sim |
| `Saida1aColeta` | janela de coleta, fim ("CPT ORIGEM") | sim |
| `Documentos` | — | fora de escopo |

Vínculo: `A` agregado · `F` frota · `T` terceiro.

**Sem chave de idempotência.** A API não oferece campo para isso — o `Codigo` do `setPreSM` serve
para *alterar* uma existente, não para evitar duplicata. Por isso a garantia é nossa, em banco
(R3).

## `getStatusPreSM` — acompanha

Recebe o código; devolve o estado atual. Alimenta FR-016.

## `setCancelaPreSM` — desfaz

Cancela uma Pré-SM **ainda não efetivada**. Alimenta FR-017, e é a única forma de desfazer uma
criação errada — o que, sem ambiente de teste, faz dele parte do caminho de validação e não um
extra.

## `getModelosPreSM` — lista os modelos

Só `Ambiente`/`Login`/`Senha`/`TipoRetorno`. Devolve `Modelos[]` com `Codigo` e `Descricao`.
Alimenta a carga de `pre_sm_route_models`. Medido: **89 modelos**, cobrindo 84% das nossas viagens.

## `getVeiculo` / `getCarreta` — sugerem o vínculo

Recebem a placa; devolvem, entre outros, `CNPJProprietario`. É o que pré-seleciona o vínculo (FR-009):

- CNPJ igual ao nosso (raiz `03571231`) → **frota própria**
- CPF (valor com zeros à esquerda até 14 dígitos) → pessoa física, **nunca** frota própria
- outro CNPJ → empresa; resta a pessoa dizer se é agregado ou terceiro

Carreta **não existe** no `getVeiculo` (`CodErro 109`) — tem cadastro próprio. E o dono da carreta
nem sempre é o do cavalo: medido nos dois sentidos.

## `getMotorista` — NÃO sugere vínculo

Devolve CNH, validade, categoria, MOPP, toxicológico, endereço — **e nem vínculo nem empregador**.
Por isso o vínculo do motorista nasce em branco (FR-009): não há palpite possível.

## Erros observados

| `CodErro` | significa |
|---|---|
| `0` | sem erro |
| `100` | usuário inválido (é o que homologação responde para nós) |
| `109` | não encontrado (placa de carreta consultada como veículo, por exemplo) |

A lista completa está no anexo do PDF da Integra 14.2. O sistema **não traduz** essas mensagens:
mostra a da gerenciadora (FR-014).
