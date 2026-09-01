# Contrato: as rotas do aceite de spot

**Feature**: 030-aceite-de-spot · **Date**: 2026-09-01

Três rotas: uma que já existe e engorda, uma que já existe e ganha um campo, e **uma única escrita
nova** — a dispensa. Nenhuma rota nova de aceite (FR-009).

---

## 1 · `GET /api/spot-offers` — engorda

**Permissão**: `view_all_trips`, como hoje. Quem enxerga o painel enxerga a oferta.

**Ritmo**: `SPOT_OFFERS_POLL_MS = 5_000`, com `refetchIntervalInBackground`. Inalterado.

**O que muda**: cada oferta passa a vir com o estado derivado, e **as que quem pediu dispensou não
vêm** (FR-016, FR-018 — filtrar aqui é o que faz a dispensa sobreviver ao recarregar).

### Resposta

```jsonc
{
  "ofertas": [
    {
      // — o que já existia, inalterado —
      "id": "…", "portalTripId": "…", "tripNumber": "LT0Q9202F7Q21",
      "route": "SoC_BA2 → LM Hub_PB_João Pessoa_Gramame",
      "vehicle": "Carreta", "price": "R$ 4.548,30",
      "originArrival": "01/09 16:29", "departure": "…", "arrival": "…",
      "operator": "…", "createdAtPortal": "…", "receivedAt": "…",

      // — o que passa a vir —
      "estado": "esperando",        // sem_viagem | esperando | enviado | recusado
      "tripId": "uuid ou null",     // null quando estado = sem_viagem
      "podeAceitar": true,          // false quando falta viagem, falta permissão, ou há ordem aberta
      "decidiuUserId": "uuid|null", // quem mandou a ordem, quando estado = enviado
      "decidiuNome": "Victor TI",   // para o cartão dizer por quem, sem uma segunda busca
      "erroDoPortal": null          // preenchido só quando estado = recusado
    }
  ]
}
```

**`estado = "aceito"` NUNCA aparece na resposta.** Uma oferta aceita simplesmente não está na lista —
é assim que o cartão sai da tela, e é a garantia por construção do FR-014 (ver R5). O cliente não
tem, e não deve ganhar, um ramo de código que remova cartão por aceite.

**`podeAceitar` é conveniência da tela, não a autoridade.** A decisão real é do servidor, na rota de
aceite. Um cliente que ignorasse este campo não conseguiria aceitar o que não pode.

**`erroDoPortal`** carrega dois campos quando presente: `codigo` (quando dá para extrair) e
`mensagem` (o texto que o portal devolveu, cru). A tradução em português dos códigos já observados é
da tela — ver R6. Código desconhecido mostra a mensagem crua, nunca "erro desconhecido".

---

## 2 · `POST /api/trips/[id]/portal-action` — ganha um campo

**A rota do aceite não muda de endereço.** É a mesma que a tela de viagem usa, com o mesmo
`requirePermission`, o mesmo `enfileirarOrdemDoPortal`, o mesmo `impedimentoDaAcao` e a mesma
auditoria na mesma transação.

### O que muda

O corpo aceita um campo **opcional** dizendo de onde a decisão saiu:

```jsonc
{
  "action": "accept",
  "origem": "oferta_spot"   // opcional; ausente = "tela_da_viagem"
}
```

Ele é gravado no `newValue` do registro de auditoria que a rota já escreve (FR-025). Não muda a
assinatura de `enfileirarOrdemDoPortal` para nenhum chamador que já existe.

### As recusas que já existem e continuam valendo

| situação | o que o servidor responde |
| --- | --- |
| a viagem não está `Pending` | `nao_esta_pendente` |
| falta o `ID (portal)` | `sem_id_do_portal` |
| já há ordem em voo | `ordem_em_andamento` |
| falta permissão | 403, antes de qualquer coisa |

**Estas quatro são o que torna seguro exercitar o caminho de escrita sem gastar**: apontá-lo para uma
viagem que não está pendente prova o guarda sem que nada chegue ao portal.

---

## 3 · `POST /api/spot-offers/[id]/dispensar` — a única escrita nova

**Permissão**: `view_all_trips` — a mesma da leitura. Dispensar é um gesto sobre a própria tela, não
sobre o frete; quem pode ver pode limpar a própria vista.

**Corpo**: vazio. Quem dispensa é quem está autenticado, e não pode ser outro.

**Efeito**: `insert into spot_offer_dispensas (spot_offer_id, user_id) … on conflict do nothing`.

**Resposta**: `204`. Idempotente: dispensar duas vezes responde igual.

### O que esta rota NÃO faz

- **Não envia nada ao portal.** Ignorar não é rejeitar (FR-016). Rejeitar exige motivo do
  vocabulário do portal e está fora de escopo.
- **Não remove nada.** A oferta continua na tabela, continua no registro do dia e continua na tela
  dos colegas (FR-017, FR-019, I2).
- **Não existe o inverso.** Não há rota para "des-dispensar": o caminho de volta é o Painel do dia,
  onde a linha continua listada, assinalada, e ainda aceitável (FR-019). Uma rota de desfazer seria
  um segundo jeito de a oferta voltar à tela, e não há pedido para isso.

---

## 4 · O que o Painel do dia recebe

`readSpotPorRegiao` continua entregando as linhas dentro do payload do painel, sem busca própria.
Cada linha ganha:

```jsonc
{
  "rota": "…", "lh": "…", "sta": "…", "veiculo": "…", "preco": "…",
  "estado": "esperando",       // a MESMA derivação do cartão — R1, R9, FR-022
  "dispensadaPorMim": false,   // só marca; a linha aparece de qualquer forma (FR-019)
  "tripId": "uuid ou null"     // para a ação na linha chamar a mesma rota de aceite
}
```

**`aceito` APARECE aqui**, ao contrário da rota do cartão — porque o painel é o registro do dia e
precisa mostrar o que foi aceito. É a diferença entre as duas leituras, e é deliberada: uma é a fila
do que falta decidir, a outra é a história do que aconteceu.

**O campo `aceito` booleano de hoje passa a ser derivado da aceitação do portal**, e não de
`t.id is not null`. Ver R9 — é uma correção, não só um campo novo.
