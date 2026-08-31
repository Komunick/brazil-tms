"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MiniPerfil } from "@/components/usuarios/mini-perfil";

/**
 * O PRÓPRIO PERFIL, aberto pelo nome na barra de topo (fatia 029, US2 · FR-019).
 *
 * ── POR QUE AQUI, E NÃO NUMA PÁGINA "MEU PERFIL" ──────────────────────────────────────────────
 *
 * O nome de quem está logado já está na barra de topo, em toda tela. Uma página própria exigiria um
 * item de menu para uma tarefa que se faz uma vez — trocar a foto — e o menu já tem trinta itens.
 *
 * ── E O ENVIO SÓ APARECE PARA A PRÓPRIA PESSOA ────────────────────────────────────────────────
 *
 * `PUT /api/me/foto` tira o id da SESSÃO, nunca do corpo: não existe caminho para trocar a foto de
 * outra pessoa por esta rota. Quem administra usuários troca a de qualquer um, e isso tem rota
 * própria — alcançada pelo cartão da lista de usuários.
 */
export function MeuPerfil({ userId, nome }: { userId: string; nome: string }) {
  const t = useTranslations("Perfil");
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const enviar = useMutation({
    mutationFn: async (file: File) => {
      const corpo = new FormData();
      corpo.append("file", file);
      const res = await fetch("/api/me/foto", { method: "PUT", body: corpo });
      if (!res.ok) {
        /*
          O código vem ANINHADO em `error`, e não no topo — é o formato do `handleRouteError`.
          Ler `c.code` direto devolvia `undefined` e a tela mostrava "não foi possível" em vez do
          motivo real: "a foto passa de 2 MB", que é o que diz o que fazer.
        */
        const c = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
        throw new Error(c.error?.code ?? "ERRO");
      }
    },
    onSuccess: () => {
      setErro(null);
      /*
        Invalida o perfil E o navegador: a URL da foto é a mesma (`/api/users/:id/foto`), então sem
        recarregar a imagem o cartão continuaria mostrando a foto antiga do cache do navegador.
      */
      void qc.invalidateQueries({ queryKey: ["perfil", userId] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="truncate rounded text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {nome}
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("meuPerfil")}</DialogTitle>
          </DialogHeader>

          {aberto ? <MiniPerfil userId={userId} /> : null}

          <div className="space-y-2">
            <input
              ref={arquivoRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) enviar.mutate(file);
                // Zera para que escolher O MESMO arquivo de novo dispare o evento outra vez.
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={enviar.isPending}
              onClick={() => arquivoRef.current?.click()}
            >
              {enviar.isPending ? t("enviando") : t("trocarFoto")}
            </Button>
            <p className="text-xs text-muted-foreground">{t("regraDaFoto")}</p>
            {erro ? (
              <p role="alert" className="text-xs text-destructive">
                {t(`erroFoto.${erro}`)}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
