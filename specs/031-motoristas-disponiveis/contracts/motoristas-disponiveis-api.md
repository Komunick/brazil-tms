# Contrato: `GET /api/fleet/motoristas-disponiveis`

**Feature**: 031 · **Date**: 2026-09-03

A **única** interface da fatia. Não há rota de escrita, e não deve nascer nenhuma.

---

## Requisição

```http
GET /api/fleet/motoristas-disponiveis
```

**Sem parâmetros.** A busca e a ordenação são estado da tela, não da consulta — mandar o filtro para
o servidor faria a lista recarregar a cada tecla e mudaria o resultado debaixo de quem digita.

**Permissão**: `view_all_trips`, decidida no BFF. A mesma da Torre de Controle. Sem ela, **403**.

---

## Resposta `200`

```jsonc
{
  "motoristas": [
    {
      "driverId": "uuid",
      "nome": "JOEL SEVERO DA SILVA",
      "origem": "LM HUB_RN_NATAL_01",
      "destino": "SOC_PE_JABOATÃO DOS GUARARAPES",
      "cavalo": "EMU7F18",
      "carreta": null,              // null, nunca a placa do cavalo repetida
      "inicio": "2026-09-02T12:01:00.000Z",   // UTC; a tela formata em São Paulo
      "conclusao": "2026-09-03T06:00:00.000Z",
      "situacao": "finalizado",     // "finalizado" | "cancelada" | "a_caminho"
      "statusDaViagem": "completed",// o status corrente, para o rótulo do "a caminho"
      "tripId": "uuid",             // para o link até a viagem
      "impedimento": null           // ou { "motivo": "inativo" | "bloqueado", "detalhe": "..." }
    }
  ],
  "contagem": { "disponiveis": 135, "aCaminho": 80 }
}
```

### O que a resposta NÃO traz, e por quê

- **`disponivel: true`** — não existe. A situação é o rótulo; um segundo campo booleano seria uma
  segunda fonte para a mesma verdade, e as duas divergiriam no primeiro ajuste do corte.
- **A lista de todas as viagens do motorista.** A aba mostra a última; mandar as outras seria peso por
  minuto, por aba aberta, para um dado que ninguém lê ali.
- **Qualquer campo de escrita ou ação.** A aba informa; atribuir continua na Expedição.

### Regras da forma

- `carreta` é `null` quando não há segunda placa — **nunca** a placa do cavalo repetida (FR-003).
- `cavalo` pode ser `null` se o portal não mandou placa; a tela mostra vazio e assinalado.
- Datas em **UTC**, no formato ISO. A conversão para São Paulo é da tela, e é lá que "hoje" e "amanhã"
  ganham sentido.
- `contagem.disponiveis` soma `finalizado` **e** `cancelada` — as duas são motorista livre. A separação
  entre elas é o rótulo da linha, porque só uma delas significa carga entregue (I4).

---

## Erros

| Código | Quando |
|--------|--------|
| `401` | sessão ausente ou inválida |
| `403` | sem `view_all_trips` |
| `500` | falha inesperada, pelo tratador de erro que as outras rotas já usam |

Não há `404`: a lista vazia é `200` com `motoristas: []` e as contagens em zero. Uma lista vazia é
uma resposta legítima — a tela diz isso em palavras (FR-024).

---

## Frescor

A tela relê a cada **60 segundos** (R7), sem atualização em segundo plano. O custo medido da consulta
é **10,9 ms** contra a produção, devolvendo 215 linhas.
