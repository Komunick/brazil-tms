#!/usr/bin/env bash
#
# PUBLICAR UM ROBÔ NA VM SEM DESTRUIR A CONFIGURAÇÃO DELE (2026-08-26, depois de destruir).
#
# ── O QUE ISTO EVITA ──────────────────────────────────────────────────────────────────────────
#
# Os userscripts são versionados em `infra/*-robot/*.user.js`, e o arquivo versionado carrega
# PLACEHOLDER na configuração — `token: "COLE_A_SUA_CHAVE"` — porque segredo não entra no git.
#
# Quem publica um conserto tende a fazer o óbvio:
#
#     cp infra/bsc-robot/bsc-feed.user.js /home/ubuntu/robo-portal/entrega/
#
# E isso troca o token de produção pelo placeholder. O robô sobe, roda, lê a tela inteira, e o TMS
# responde `401 UNAUTHORIZED — Token inválido` em toda entrega. Aconteceu em 26/08 com o BSC, e já
# tinha acontecido com os quatro robôs de uma vez (PR #165, quando nasceram apontando para o dev).
#
# O modo como falha é caro: o robô parece saudável, o console mostra leitura completa, e só o painel
# para de envelhecer. É o mesmo buraco que o aviso de frescor do BSC existe para fechar.
#
# ── O QUE ELE FAZ ─────────────────────────────────────────────────────────────────────────────
#
# Copia só o CÓDIGO e PRESERVA a configuração que já estava na máquina: `tms`, `token` e qualquer
# outra linha do bloco `CONFIG`. Guarda backup antes, e imprime o que ficou para conferência —
# sem mostrar o segredo inteiro.
#
# ── POR QUE NÃO É O DEPLOY QUE FAZ ISSO ───────────────────────────────────────────────────────
#
# Porque o deploy não sabe que estes arquivos existem: ele publica o app e o worker. O userscript é
# servido por um `http.server` de onde o Tampermonkey o busca, e essa pasta não é tocada por deploy
# nenhum. São dois lugares, e o deploy cuida de um só — o que também significa que um robô consertado
# no `main` continua quebrado na VM até alguém rodar isto.
#
# ── USO ───────────────────────────────────────────────────────────────────────────────────────
#
#   bash infra/userscript-server/instalar.sh bsc-feed
#   bash infra/userscript-server/instalar.sh               # lista os disponíveis
#
# Depois: abrir `http://127.0.0.1:8899/<nome>.user.js` no Chromium do robô e aceitar o Update. A
# `@version` precisa ter subido no arquivo versionado, senão o Tampermonkey oferece "Reinstall" e a
# pessoa acha que não funcionou.
set -euo pipefail

REPO="${REPO:-/home/ubuntu/komunick/repos/brazil-tms}"
ENTREGA="${ENTREGA:-/home/ubuntu/robo-portal/entrega}"

# As chaves do bloco CONFIG que pertencem À MÁQUINA e nunca ao repositório.
CHAVES=(tms token)

listar() {
  echo "Robôs disponíveis:"
  find "$REPO/infra" -name "*.user.js" -printf "  %f\n" 2>/dev/null | sed 's/\.user\.js//'
}

[ $# -ge 1 ] || { listar; exit 1; }
NOME="${1%.user.js}"

ORIGEM="$(find "$REPO/infra" -name "$NOME.user.js" | head -1)"
[ -n "$ORIGEM" ] || { echo "ERRO: não achei $NOME.user.js no repositório."; listar; exit 1; }

DESTINO="$ENTREGA/$NOME.user.js"
[ -f "$DESTINO" ] || { echo "ERRO: $DESTINO não existe. Primeira instalação é à mão, com a configuração."; exit 1; }

# ── 1. Guarda o que está rodando ──────────────────────────────────────────────────────────────
VERSAO_ANTIGA="$(sed -nE 's|^// *@version *(.*)$|\1|p' "$DESTINO" | head -1)"
BACKUP="$DESTINO.bak-$(date +%Y%m%d-%H%M%S)"
cp -p "$DESTINO" "$BACKUP"

# ── 2. Lê a configuração ATUAL, da máquina ────────────────────────────────────────────────────
#
# Antes de copiar qualquer coisa: se algum valor faltar, é melhor abortar com o robô velho rodando
# do que publicar um com placeholder. Robô velho funciona; robô sem token não.
declare -A ATUAL
for k in "${CHAVES[@]}"; do
  v="$(sed -nE "s|^ *$k: \"([^\"]*)\".*|\1|p" "$DESTINO" | head -1)"
  if [ -z "$v" ] || [[ "$v" == COLE_* ]]; then
    echo "ERRO: '$k' está vazio ou é placeholder no arquivo em uso ($DESTINO)."
    echo "      Nada foi alterado. Corrija à mão antes de usar este script."
    exit 1
  fi
  ATUAL["$k"]="$v"
done

# ── 3. Copia o código novo e repõe a configuração ─────────────────────────────────────────────
cp "$ORIGEM" "$DESTINO"
for k in "${CHAVES[@]}"; do
  # O valor vai por variável de ambiente e não interpolado na expressão: token com `&` ou `|`
  # dentro viraria referência de substituição do sed e sairia corrompido, sem erro nenhum.
  V="${ATUAL[$k]}" K="$k" perl -pi -e 's|^( *\Q$ENV{K}\E: ")[^"]*(".*)|$1$ENV{V}$2|' "$DESTINO"
done

# ── 4. Confere o que ficou, sem mostrar o segredo ─────────────────────────────────────────────
VERSAO_NOVA="$(sed -nE 's|^// *@version *(.*)$|\1|p' "$DESTINO" | head -1)"
echo "  arquivo : $DESTINO"
echo "  versão  : $VERSAO_ANTIGA  ->  $VERSAO_NOVA"
for k in "${CHAVES[@]}"; do
  v="$(sed -nE "s|^ *$k: \"([^\"]*)\".*|\1|p" "$DESTINO" | head -1)"
  if [ "$v" != "${ATUAL[$k]}" ]; then
    echo "ERRO: '$k' não foi preservado. Restaurando o backup."
    cp -p "$BACKUP" "$DESTINO"
    exit 1
  fi
  echo "  $k: ${v:0:6}… (${#v} caracteres) — preservado"
done

if [ "$VERSAO_ANTIGA" = "$VERSAO_NOVA" ]; then
  echo ""
  echo "AVISO: a @version não mudou. O Tampermonkey vai oferecer 'Reinstall' em vez de 'Update',"
  echo "       e quem instalar vai achar que não pegou. Suba a versão no arquivo versionado."
fi

echo ""
echo "Agora, no Chromium do robô: abra http://127.0.0.1:8899/$NOME.user.js e aceite o Update."
echo "Backup do anterior em: $BACKUP"
