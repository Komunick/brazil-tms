"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  avisarNoSistema,
  estadoDoAviso,
  pedirPermissao,
  type EstadoDoAviso,
} from "@/lib/spot/aviso-do-sistema";

/**
 * LIGAR O AVISO DA ÁREA DE TRABALHO, e provar que ele chega (2026-08-22, a pedido).
 *
 * Mora na tela de ofertas porque é aqui que a pessoa está quando pensa no assunto — e não numa tela
 * de configurações onde ninguém entra. São duas ações e nada mais: permitir, e testar.
 *
 * ── POR QUE O BOTÃO DE TESTE NÃO É SUPÉRFLUO ───────────────────────────────────────────────────
 *
 * Aviso do sistema falha de formas que a página não enxerga: o Windows em "assistência ao foco", o
 * Chrome com avisos desligados no nível do sistema, a permissão concedida num perfil e não no outro.
 * Em todos esses casos o navegador diz "concedida" e nada aparece na tela.
 *
 * Sem um teste, a pessoa só descobre isso na sexta-feira em que a oferta passou e ninguém viu. Com
 * ele, a pergunta "isso funciona aqui?" se responde em um segundo, hoje.
 *
 * O teste é o ÚNICO caso que ignora a regra de só avisar com a aba escondida: quem apertou está
 * olhando para a tela e quer ver acontecer.
 */
export function AvisosDoSistema() {
  const t = useTranslations("Spot");
  // Começa indefinido: `Notification` não existe no servidor, e ler no primeiro render faria a
  // marcação do servidor discordar da do navegador.
  const [estado, setEstado] = useState<EstadoDoAviso | null>(null);
  const [testou, setTestou] = useState(false);

  useEffect(() => setEstado(estadoDoAviso()), []);

  if (estado === null) return null;

  if (estado === "indisponivel") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <BellOff aria-hidden className="h-3.5 w-3.5" />
        {t("systemUnavailable")}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {estado === "concedida" ? (
          <span className="flex items-center gap-1.5 text-xs text-success">
            <BellRing aria-hidden className="h-3.5 w-3.5" />
            {t("systemOn")}
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={estado === "negada"}
            onClick={async () => setEstado(await pedirPermissao())}
          >
            <Bell aria-hidden className="mr-1.5 h-3.5 w-3.5" />
            {t("systemEnable")}
          </Button>
        )}

        {estado === "concedida" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              // `somenteSeEscondido: false` — quem pediu o teste está olhando para cá.
              setTestou(
                avisarNoSistema(t("systemTestTitle"), t("systemTestBody"), {
                  somenteSeEscondido: false,
                }),
              );
            }}
          >
            {t("systemTest")}
          </Button>
        ) : null}
      </div>

      {/**
       * A recusa do navegador é dita com todas as letras.
       *
       * Uma vez negada, a página NÃO pode pedir de novo — o Chrome ignora chamadas seguintes. Sem
       * esta frase, o botão simplesmente não faz nada e parece defeito nosso.
       */}
      {estado === "negada" ? (
        <p role="alert" className="text-xs text-destructive">
          {t("systemDenied")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("systemHint")}</p>
      )}

      {testou ? <p className="text-xs text-success">{t("systemTestBody")}</p> : null}
    </div>
  );
}
