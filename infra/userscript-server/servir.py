#!/usr/bin/env python3
"""
Serve os userscripts dos robôs para o Tampermonkey — SEM CACHE.

O `python -m http.server` que rodava aqui não manda `Cache-Control` nem `ETag`, só
`Last-Modified`. Nessa situação o Chromium aplica cache heurístico: ele pode reaproveitar o corpo
antigo sem perguntar nada ao servidor. Foi o que aconteceu em 2026-08-22 — o Tampermonkey MOSTRAVA
o arquivo novo (porque navegar até a URL revalida) e EXECUTAVA um corpo velho, sem o token. Meia
hora de caça a um fantasma que não estava em lugar nenhum do código.

`no-store` acaba com a classe inteira do problema: toda busca vai ao disco.

Também registra cada download em `log/entrega.log`. Sem isso não dá para responder à pergunta que
mais importa quando um robô não atualiza: "ele chegou a baixar?".
"""

import http.server
import socketserver
import time
from pathlib import Path

RAIZ = Path("/home/ubuntu/robo-portal/entrega")
LOG = Path("/home/ubuntu/robo-portal/log/entrega.log")
PORTA = 8899


class SemCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(RAIZ), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, formato, *args):
        linha = "%s %s %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), self.address_string(), formato % args)
        try:
            LOG.parent.mkdir(parents=True, exist_ok=True)
            with LOG.open("a", encoding="utf-8") as f:
                f.write(linha)
        except OSError:
            pass


class Servidor(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Servidor(("127.0.0.1", PORTA), SemCache) as s:
        s.serve_forever()
