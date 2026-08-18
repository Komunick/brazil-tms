# Robô do portal

Alimenta o TMS com o que o portal do cliente já sabe, sem ninguém exportar planilha.

## Como funciona

```
Chrome logado na VM ──GET──> portal (2 listagens)
        │
        └──POST /api/imports/portal-feed──> TMS ──> mesma tubulação do upload
```

O script (`portal-feed.user.js`) é **burro de propósito**: busca e entrega o JSON cru. Todo o
mapeamento vive no TMS (`packages/shared/src/import/portal-api.ts`), sob teste — script em VM é
difícil de atualizar e impossível de testar.

**Somente leitura.** Só existe `GET`, e só para as duas listagens. Nenhum clique, nenhuma escrita no
portal, nada de atribuir ou aceitar.

## Instalação

1. Na VM dedicada, deixe o Chrome logado no portal, com a aba aberta.
2. Instale o Tampermonkey.
3. Novo script → cole `portal-feed.user.js` → ajuste o bloco `CONFIG`:
   - `tms`: `https://tmsdev.braziltransports.com.br` (ou o de produção).
   - `token`: o mesmo valor de `PORTAL_FEED_TOKEN` no servidor.
4. Salve. O console do navegador (F12) mostra cada ciclo.

## Configuração no servidor

Duas variáveis, no `.env` da aplicação:

| Variável | Para quê |
|---|---|
| `PORTAL_FEED_TOKEN` | Segredo compartilhado com o script. **Mínimo 32 caracteres** — abaixo disso a rota se recusa a funcionar, para que um segredo vazio nunca signifique "aberto a todos". |
| `PORTAL_FEED_ACTOR_EMAIL` | Usuário de serviço em nome de quem o robô age. Todo evento e auditoria que ele escrever nomeia esse usuário — e ele pode ser revogado. |

Gerar um token: `openssl rand -base64 48`

## O que esperar

- **Plano** (aba Planejado) a cada 15 min: cria e atualiza viagens da janela de ontem até 7 dias à frente.
- **Execução** (aba Concluído) a cada 5 min: grava chegada/saída/chegada ao destino com o horário real.
- Ciclo silencioso **não** escreve no Histórico de Importações. Só aparece lá o que mudou alguma
  coisa, ou o que precisa de alguém — estação sem cadastro, falha, viagem rejeitada.

## Quando algo dá errado

| Sintoma | Causa provável |
|---|---|
| `stationId não encontrado` | A sessão do portal caiu. Logar de novo na VM. |
| `TMS respondeu 401` | `PORTAL_FEED_TOKEN` diferente entre script e servidor. |
| `O portal respondeu erro 131207003` | Sessão expirada ou estação sem permissão. |
| `estações sem cadastro no TMS` | Cadastrar o local e ligar o id da estação (`db:seed:shopee-stations`). |

Nenhum desses mata o robô: o ciclo seguinte tenta de novo.
