# Contrato: cargos, perfil e selos (029)

Todas sob `requireAuth`. A permissão exigida está em cada uma. Erros seguem o formato do
`handleRouteError` que o repositório já usa.

---

## Cargos

### `GET /api/cargos` — `manage_users`

Lista cargos com a contagem de pessoas em cada um (FR-008), **antes** de qualquer edição.

```json
{ "cargos": [
  { "id": "…", "nome": "Despachante", "ativo": true, "pessoas": 14,
    "permissoes": ["view_all_trips", "assign_resources"] }
] }
```

### `POST /api/cargos` — `manage_users`

`{ "nome": "Despachante" }` → nasce **sem permissão nenhuma**, e a tela avisa antes de salvar que
quem entrar nele não verá nada (caso de borda da spec: parece defeito, e não é).

### `PUT /api/cargos/[id]` — `manage_users`

`{ "nome": "…", "permissoes": ["…"], "ativo": true }` — **estado final**, não `add`/`remove`. A última
gravação vence, como no resto do sistema.

Recusa com `422` quando:

| código | quando |
|---|---|
| `ULTIMO_ADMIN` | a gravação deixaria a organização sem quem administre (FR-010) |
| `ALEM_DO_PROPRIO_ACESSO` | concede permissão que quem edita não alcança (FR-012) |
| `PERMISSAO_DESCONHECIDA` | chave fora do catálogo (FR-002) |

A resposta devolve **o que ficou guardado**, não o que foi mandado — a tela não pode seguir achando
que gravou outra coisa. (É o defeito de `programacao_prefs` invertido: lá a resposta omitia o que a
gravação descartara.)

### `DELETE /api/cargos/[id]` — `manage_users`

Desativa; **não apaga** (princípio III). Com gente dentro, exige destino:
`{ "moverPara": "<cargo_id>" }`. Sem destino e com gente dentro → `422 CARGO_COM_PESSOAS`.

---

## Pessoas

### `PUT /api/users/[id]/cargo` — `manage_users`

`{ "cargoId": "…" }`. Recusa com `ULTIMO_ADMIN` se mover a última pessoa que administra.

Vale **na requisição seguinte** da pessoa movida, sem ela sair e entrar (FR-007) — a sessão lê o banco
a cada requisição.

### `GET /api/users/[id]/perfil` — qualquer autenticado

O que o mini perfil mostra. **Não** devolve e-mail nem a lista de permissões: o cartão responde "quem
é e o que faz", não "o que consegue alcançar".

```json
{ "id": "…", "nome": "Anderson Paixão", "cargo": "Despachante",
  "selos": [{ "nome": "Líder", "cor": "azul" }],
  "foto": "…url curta…", "iniciais": "AP", "ativo": true }
```

Conta desativada volta com `ativo: false`, e o cartão diz isso em vez de abrir vazio.

---

## Foto

**Rota própria, e não a de frota** — ver research §6.

### `PUT /api/me/foto` — qualquer autenticado (a própria)
### `PUT /api/users/[id]/foto` — `manage_users` (a de qualquer um)

Multipart. Recusa `413` acima do teto e `415` fora dos formatos aceitos, **sem guardar nada** (FR-021).

Grava em `resource_documents` com `entityType='user'`, `docType='foto_perfil'`. A atual é a mais
recente; o histórico fica.

### `GET /api/users/[id]/foto` — qualquer autenticado

Redireciona para link de curta duração do bucket privado. **Nunca** endereço público permanente
(FR-022).

---

## Selos

### `GET /api/selos` — qualquer autenticado
### `POST /api/selos` · `PUT /api/selos/[id]` · `DELETE /api/selos/[id]` — `manage_users`
### `PUT /api/users/[id]/selos` — `manage_users`

`{ "selos": ["<id>", "<id>"] }` — estado final.

**Nenhuma destas rotas toca autorização.** É verificável por construção: elas não escrevem em
`cargo_permissoes` nem em `users.cargo_id` (FR-013).

---

## O que muda no que já existe

`GET /api/me` passa a devolver `cargo` e `permissoes`. A tela precisa delas para decidir o que
desenhar — e é a **mesma lista** que o servidor usa para decidir o que permitir, lida do mesmo lugar.
Duas listas seriam dois caminhos de autorização; é o que FR-005 proíbe.
