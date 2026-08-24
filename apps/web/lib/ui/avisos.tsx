"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

/**
 * "DEU CERTO?" — o aviso que responde isso depois de cada gravação (2026-08-24, a pedido).
 *
 * O sistema salvava em silêncio. Quem clicava em Confirmar ficava olhando a tela para adivinhar se a
 * alteração pegou, e a única forma de ter certeza era recarregar e conferir. Isso é pior do que
 * parece: na dúvida, a pessoa clica de novo.
 *
 * ── POR QUE O EMISSOR VIVE FORA DO REACT ──────────────────────────────────────────────────────
 *
 * Quem sabe que uma gravação terminou é o TanStack Query, no `MutationCache` — que é criado uma vez,
 * fora de qualquer componente, e portanto não pode chamar um hook. Um `avisar()` de módulo resolve
 * isso sem espalhar contexto: o provider assina, o cache emite, e nenhuma das 100 mutações do app
 * precisa saber que avisos existem.
 *
 * É a diferença entre um ponto e cem. Avisar de dentro de cada tela significaria tocar 23 arquivos
 * hoje e lembrar de fazer o mesmo em toda tela nova — e a que esquecerem volta a salvar em silêncio.
 *
 * ── ANTES DE O PROVIDER MONTAR, O AVISO SE PERDE ──────────────────────────────────────────────
 *
 * E tudo bem: não há gravação possível antes de a tela existir. Guardar uma fila para esse caso
 * seria código para um cenário que não acontece.
 */

export type TipoDeAviso = "ok" | "erro";

export interface Aviso {
  id: number;
  tipo: TipoDeAviso;
  /** O que a pessoa acabou de fazer ("Motorista atualizado"). Opcional: sem ele vale o texto padrão. */
  texto?: string;
  /** A razão, quando há uma. Em erro é o que diz o servidor; em sucesso não se usa. */
  detalhe?: string;
}

type Ouvinte = (aviso: Aviso) => void;

let ouvinte: Ouvinte | null = null;
let proximoId = 1;

/** Dispara um aviso. Chamável de qualquer lugar — inclusive de fora do React. */
export function avisar(aviso: Omit<Aviso, "id">): void {
  ouvinte?.({ ...aviso, id: proximoId++ });
}

/**
 * O TEMPO NA TELA É DIFERENTE PARA CADA UM, e essa assimetria é deliberada.
 *
 * Sucesso é confirmação: quatro segundos bastam para o olho registrar e ninguém precisa reler. Erro
 * é informação que a pessoa vai usar para decidir o que fazer, e some só quando ela fechar — um erro
 * que evapora em quatro segundos obriga a repetir a ação só para ler o motivo.
 */
const SUMIR_APOS_MS = 4000;

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Avisos");
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    ouvinte = (aviso) => setAvisos((atuais) => [...atuais, aviso]);
    return () => {
      ouvinte = null;
    };
  }, []);

  const fechar = (id: number) => setAvisos((atuais) => atuais.filter((a) => a.id !== id));

  return (
    <ToastProvider swipeDirection="right">
      {children}
      {avisos.map((aviso) => (
        <Toast
          key={aviso.id}
          variante={aviso.tipo}
          duration={aviso.tipo === "erro" ? Infinity : SUMIR_APOS_MS}
          onOpenChange={(aberto) => {
            if (!aberto) fechar(aviso.id);
          }}
        >
          {/*
            O SINAL VEM ANTES DA PALAVRA (2026-08-24, a pedido).
            Quem passa o olho no canto da tela lê a forma e a cor antes de ler o texto — e a
            pergunta "deu certo?" se responde nesse instante. O ícone NÃO substitui a frase: cor
            sozinha exclui quem não distingue verde de vermelho, e um V sem legenda vira adivinhação.
          */}
          {aviso.tipo === "ok" ? (
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-500"
              aria-hidden
            />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          )}
          <div className="min-w-0 flex-1 space-y-0.5">
            <ToastTitle>
              {aviso.texto ?? (aviso.tipo === "ok" ? t("concluido") : t("naoConcluido"))}
            </ToastTitle>
            {/* No sucesso a segunda linha só existe quando a primeira foi personalizada. */}
            {aviso.tipo === "ok" && aviso.texto ? (
              <ToastDescription>{t("concluido")}</ToastDescription>
            ) : null}
            {aviso.tipo === "erro" ? (
              <ToastDescription>{aviso.detalhe ?? t("tenteDeNovo")}</ToastDescription>
            ) : null}
          </div>
          <ToastClose aria-label={t("fechar")} />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
