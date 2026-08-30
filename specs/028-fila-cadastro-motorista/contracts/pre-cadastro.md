# Contrato — a rota que recebe o pré-cadastro

**Para quem escreve o formulário** no repositório `site-brazil-transports`. Este documento é a única
coisa que você precisa saber sobre o TMS; nada além disto é contrato.

**Estado**: proposta. A rota ainda não existe — é a etapa 1 do plano.

---

## O endereço

```
POST https://tms.braziltransports.com.br/api/publico/pre-cadastro
Content-Type: multipart/form-data
```

**Sem autenticação.** Não há token, cabeçalho ou sessão. A rota aceita chamadas apenas da origem
`https://braziltransports.com.br`.

`multipart/form-data`, e não JSON, porque vão dois arquivos junto. Mandar foto como Base64 dentro de
JSON infla o corpo em um terço — num 4G de evento isso é a diferença entre enviar e falhar.

## O que enviar

| Campo | Tipo | Obrigatório | Formato |
|---|---|---|---|
| `nome` | texto | **sim** | nome completo, 3 a 100 caracteres |
| `cpf` | texto | **sim** | só dígitos ou com pontuação — o servidor normaliza. **Dígito verificador é conferido** |
| `celular` | texto | **sim** | com DDD. 10 ou 11 dígitos |
| `cep` | texto | **sim** | 8 dígitos, com ou sem hífen |
| `numero` | texto | **sim** | número da casa, até 15 caracteres. Aceita `S/N`, `120A`, `km 12` |
| `possuiMopp` | `"sim"` \| `"nao"` | **sim** | |
| `validadeMopp` | data | se `possuiMopp=sim` | `AAAA-MM-DD` |
| `possuiToxicologico` | `"sim"` \| `"nao"` | **sim** | |
| `validadeToxicologico` | data | se `possuiToxicologico=sim` | `AAAA-MM-DD` |
| `ciencia` | `"true"` | **sim** | a ciência sobre coleta e uso dos dados. Sem ela o envio é recusado |
| `cnh` | arquivo | **sim** | JPEG, PNG ou PDF |
| `comprovante` | arquivo | **sim** | JPEG, PNG ou PDF |

> **Por que o número da casa, se a CNH não pede?** Ele é obrigatório no `setMotorista` da
> gerenciadora quando o cadastro vai para Pesquisa e Consulta, e não sai de lugar nenhum: não está
> impresso na CNH e o ViaCEP não devolve. Sem ele o cadastro não pode ser enviado. É o único campo
> de endereço que precisa ser perguntado — rua, bairro e cidade saem do CEP.
>
> **O servidor ainda o aceita como opcional**, para não quebrar quem tiver a versão antiga da
> página aberta. O formulário deve exigi-lo mesmo assim.

**Nada além disso.** Não peça nascimento, RG, nome da mãe, Renach, categoria ou validade da CNH —
tudo isso é lido da foto depois. Pedir ao motorista o que está impresso no documento que ele acabou
de fotografar é trabalho jogado fora, e num estande é o que faz a pessoa desistir.

### Os arquivos

- **Tipos aceitos**: `image/jpeg`, `image/png`, `application/pdf`
- **Teto por arquivo**: definido no servidor e **recusado se ultrapassar**

**Comprima a imagem no navegador antes de enviar.** Uma foto de CNH sai do celular com 4 a 5 MB; num
4G congestionado isso falha. O servidor impõe o teto, mas ele não comprime por você — se chegar
grande, é recusa, e a pessoa perde o cadastro sem entender por quê.

## O que volta

### Quando dá certo

```
202 Accepted

{ "recebido": true }
```

**Sempre isto, sem exceção.** Não há campo que diga se o CPF era novo, se já estava na fila, ou se
já é motorista da empresa.

> **Isso é deliberado e não vai mudar.** Se a resposta distinguisse os casos, qualquer pessoa
> poderia descobrir quem é motorista da Brazil Transports mandando CPFs e olhando a resposta. O
> formulário **não tem** essa informação porque **não pode** tê-la.
>
> Não construa nada que dependa de saber qual caso foi.

### Quando o envio é recusado

```
400 Bad Request

{ "erro": "cpf_invalido", "campo": "cpf" }
```

| `erro` | Quando |
|---|---|
| `campo_faltando` | um obrigatório não veio |
| `cpf_invalido` | dígito verificador não confere |
| `celular_invalido` | fora do formato |
| `cep_invalido` | fora do formato |
| `data_invalida` | validade em formato errado |
| `ciencia_ausente` | a ciência não foi marcada |
| `arquivo_tipo` | tipo não aceito |
| `arquivo_grande` | passou do teto |
| `sem_ciencia_de_erro` | qualquer outra recusa de validação |

`campo` diz **qual** campo, para o formulário apontar o lugar certo.

### Quando há envio demais

```
429 Too Many Requests

{ "erro": "muitos_envios" }
```

Dois limites: um apertado **por CPF** — ninguém se cadastra dez vezes por engano — e um folgado
**por origem**, para não punir vinte pessoas dividindo o wi-fi de um estande.

### Quando algo quebra do nosso lado

```
500 Internal Server Error

{ "erro": "falha_interna" }
```

**Peça para tentar de novo, e não perca o que a pessoa preencheu.** Num evento sem ninguém para
socorrer, um formulário que se apaga sozinho é um cadastro perdido.

## O que o formulário deve validar antes de enviar

Não porque o servidor confia — ele **revalida tudo**, sempre. Mas porque descobrir o erro depois do
upload de duas fotos, num 4G ruim, é a pior hora possível.

- CPF: dígito verificador
- Celular e CEP: formato
- Arquivos: tipo e tamanho, **antes** de comprimir
- Ciência: marcada

## Depois de enviar

Diga **o que acontece a seguir e em quanto tempo**, e ofereça **um caminho de contato**.

O botão que este formulário substitui era o WhatsApp — um canal de duas vias. Um formulário não
responde. Quem travar no meio precisa ter para onde ir, e ninguém do escritório estará no evento
para perceber.

## O que NÃO fazer

- **Não** consultar o CPF antes de enviar. Não existe rota para isso, e não vai existir.
- **Não** pré-preencher nada com dados de quem já é motorista. O formulário não tem acesso a eles.
- **Não** guardar as fotos em lugar nenhum do lado do site. Elas vão direto para o TMS.
- **Não** mandar campo que não está na tabela acima. O servidor ignora, e alguém vai achar que
  funciona.
