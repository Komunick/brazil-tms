"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * OS CARGOS DE UMA PESSOA — vários, marcados numa lista (2026-09-01).
 *
 * ── POR QUE MARCAÇÃO E NÃO UM SELETOR ─────────────────────────────────────────────────────────
 *
 * A fatia 029 pôs um cargo por pessoa, e a tela era um `Select`: escolher um trocava o outro. O caso
 * que derrubou isso é concreto — alguém do setor GR que também cuida do spot. Com um seletor, dar o
 * SPOT tirava o GR, e não havia como a pessoa existir.
 *
 * ── A LISTA VAZIA É ESCOLHÍVEL, e isso não é detalhe ─────────────────────────────────────────
 *
 * Desmarcar tudo significa SEM ACESSO, e é o estado seguro do sistema (ver `sem-cargo.test.ts`:
 * sem cargo, o conjunto de capacidades é vazio — nunca um fallback para o papel antigo). Se a tela
 * exigisse ao menos um, tirar o acesso de alguém que sai da empresa obrigaria a inventar um cargo
 * para ele, e inventar é como um acesso sobra sem ninguém notar.
 *
 * ── E A RECUSA DO ÚLTIMO ADMINISTRADOR APARECE AQUI ──────────────────────────────────────────
 *
 * O servidor recusa tirar o último cargo que administra, e devolve `ULTIMO_ADMIN`. A tela mostra a
 * frase e NÃO desmarca — deixar a marca cair daria a impressão de que funcionou.
 */

interface CargoDisponivel {
  id: string;
  nome: string;
  ativo: boolean;
}

export function CargosDaPessoa({
  userId,
  cargoIds,
  disabled,
}: {
  userId: string;
  cargoIds: string[];
  disabled?: boolean;
}) {
  const t = useTranslations("AdminUsers");
  const qc = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: ["cargos"],
    queryFn: async () => {
      const res = await fetch("/api/cargos");
      if (!res.ok) throw new Error("FALHOU");
      return (await res.json()) as { cargos: CargoDisponivel[] };
    },
  });

  const salvar = useMutation({
    mutationFn: async (ids: string[]) => {
      /*
        `PUT`, e não `PATCH` — a rota só exporta `PUT` (2026-09-02).

        Nasceu `PATCH` aqui e ninguém percebeu: o Next responde 405 a um método sem handler, o
        `catch` transformava isso em "FALHOU", e a tela só piscava um erro sem nome. Ficou assim de
        01/09 até agora, e o sintoma era "não consigo atribuir mais de um cargo" — na verdade não
        dava para atribuir NENHUM. A prova foi a auditoria: nem um `usuario.cargo_alterado` gravado,
        embora a gravação audite dentro da mesma transação.

        E `PUT` é o verbo certo pelo próprio significado da operação: o corpo traz o CONJUNTO INTEIRO
        de cargos e substitui o que havia — não é um remendo parcial.
      */
      const res = await fetch(`/api/admin/users/${userId}/cargo`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cargoIds: ids }),
      });
      if (!res.ok) {
        /*
          O CÓDIGO HTTP ENTRA NA MENSAGEM QUANDO NÃO HÁ MOTIVO — foi o que faltou (2026-09-02).

          A recusa de negócio vem com `motivos`, e essa mensagem é boa. O resto — 405 de método sem
          handler, 403 de permissão, 500 — caía todo no mesmo "FALHOU", que não diz nada e não dá o
          que procurar. Foi assim que o `PATCH` contra uma rota `PUT` passou um dia inteiro parecendo
          um erro genérico da tela.
        */
        const corpo = (await res.json().catch(() => ({}))) as { motivos?: string[] };
        throw new Error(corpo.motivos?.[0] ?? `FALHOU (HTTP ${res.status})`);
      }
    },
    onSuccess: () => {
      setErro(null);
      void qc.invalidateQueries({ queryKey: ["admin-users"] });
      void qc.invalidateQueries({ queryKey: ["cargos"] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  /*
    Só cargo ATIVO entra na lista. O desativado não concede nada — a leitura da sessão exige
    `c.ativo` —, e oferecê-lo criaria uma marca que a tela mostra como acesso e o servidor ignora.
  */
  const disponiveis = (consulta.data?.cargos ?? []).filter((c) => c.ativo);
  const marcados = new Set(cargoIds);
  const nomes = disponiveis
    .filter((c) => marcados.has(c.id))
    .map((c) => c.nome)
    .join(", ");

  const alternar = (id: string) => {
    const proximos = marcados.has(id)
      ? cargoIds.filter((x) => x !== id)
      : [...cargoIds, id];
    salvar.mutate(proximos);
  };

  return (
    <div className="flex flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-56 justify-between font-normal"
            disabled={disabled || salvar.isPending}
            aria-label={t("changeCargos")}
          >
            <span className="truncate">{nomes || t("semCargo")}</span>
            <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto p-1">
          {disponiveis.map((c) => {
            const marcado = marcados.has(c.id);
            return (
              /*
                Um `button` e não `DropdownMenuCheckboxItem`: o menu do Radix fecha ao escolher, e
                aqui a pessoa costuma marcar dois de uma vez. Fechar a cada marca faria reabrir o
                menu para cada cargo — e é justamente a marcação múltipla que esta tela veio trazer.
              */
              <button
                key={c.id}
                type="button"
                onClick={() => alternar(c.id)}
                disabled={salvar.isPending}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    marcado ? "border-primary bg-primary text-primary-foreground" : ""
                  }`}
                >
                  {marcado ? <Check className="h-3 w-3" aria-hidden /> : null}
                </span>
                <span className="truncate">{c.nome}</span>
              </button>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* A recusa fica VISÍVEL na linha, e a marca não cai: cair daria a impressão de que passou. */}
      {erro ? (
        <p role="alert" className="text-xs text-destructive">
          {erro === "ULTIMO_ADMIN" ? t("ultimoAdmin") : t("cargoFalhou")}
        </p>
      ) : null}
    </div>
  );
}
