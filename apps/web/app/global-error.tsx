"use client";

/* eslint-disable no-restricted-syntax -- TEXTO FIXO É REQUISITO AQUI, não descuido.
 *
 * A regra SC-006 exige `t()` do next-intl em todo JSX, e ela está certa em toda tela — menos nesta.
 * Uma tela de erro que depende do pipeline de tradução não aparece quando é o pipeline que falha, e
 * "MISSING_MESSAGE" no lugar da explicação é pior do que nenhuma tela.
 *
 * O custo é real e pequeno: a UI é pt-BR e existe UM único arquivo de mensagens no repositório
 * (`pt-BR.json`). No dia em que houver um segundo idioma, estas duas telas precisam de uma decisão
 * própria — provavelmente detectar o idioma do navegador, sem passar pelo next-intl.
 */

import { useEffect, useState } from "react";
import { deveRecarregar, esquecerRecarga } from "@/lib/ui/chunk-velho";

/**
 * O ÚLTIMO ANTEPARO — quando o próprio layout raiz quebra (2026-08-31).
 *
 * É este boundary que responde pelo "Application error: a client-side exception has occurred", a
 * tela que a pessoa viu em 31/08 e que não diz absolutamente nada.
 *
 * ── ELE SUBSTITUI O `<html>` INTEIRO ──────────────────────────────────────────────────────────
 *
 * Requisito do Next, e a razão é dura: se o layout raiz quebrou, não há `<html>` nem `<body>` de
 * onde pendurar nada. Por isso este arquivo os desenha, e por isso ele NÃO usa nenhum componente
 * nosso, nem o `next-intl`.
 *
 * Uma tela de erro que depende do que quebrou não aparece. Estilo inline pelo mesmo motivo: se o
 * CSS não carregou, as classes do Tailwind não existem.
 *
 * ── O TEXTO É FIXO EM PORTUGUÊS, de propósito ─────────────────────────────────────────────────
 *
 * Traduzir aqui exigiria o pipeline de i18n, que é uma das coisas que podem ter falhado. Um "erro"
 * escrito por extenso vale mais que uma chave de tradução não resolvida.
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const [recarregando, setRecarregando] = useState(false);

  useEffect(() => {
    if (!deveRecarregar(error)) return;
    setRecarregando(true);
    location.reload();
  }, [error]);

  useEffect(() => {
    if (recarregando) return;
    const t = setTimeout(esquecerRecarga, 5000);
    return () => clearTimeout(t);
  }, [recarregando]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#fff",
          color: "#111",
        }}
      >
        <div style={{ maxWidth: 520, padding: 32, textAlign: "center" }}>
          {recarregando ? (
            <p style={{ color: "#666", fontSize: 14 }}>Atualizando para a versão nova…</p>
          ) : (
            <>
              <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>O TMS não conseguiu carregar</h1>
              <p style={{ color: "#666", fontSize: 14, margin: "0 0 16px" }}>
                Recarregue a página. Se continuar, avise quem cuida do TMS com o horário e a
                mensagem abaixo.
              </p>
              <code
                style={{
                  display: "block",
                  background: "#f4f4f5",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 12,
                  textAlign: "left",
                  overflowX: "auto",
                  marginBottom: 16,
                }}
              >
                {error.message || error.name}
              </code>
              <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={reset}
                  style={{
                    border: "1px solid #d4d4d8",
                    background: "#fff",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Tentar de novo
                </button>
                <button
                  type="button"
                  onClick={() => location.reload()}
                  style={{
                    border: "none",
                    background: "#111",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Recarregar a página
                </button>
              </div>
            </>
          )}
        </div>
      </body>
    </html>
  );
}
