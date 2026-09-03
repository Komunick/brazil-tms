"use client";

import { useTranslations } from "next-intl";
import { CloudOff, Gauge, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { precisaAvisar, type EstadoDaConexao } from "@/lib/conexao/diagnostico";
import { useConexao } from "@/lib/conexao/use-conexao";

/**
 * O AVISO DE CONEXÃO NA BARRA DE TOPO (2026-09-03).
 *
 * ── CALADO ENQUANTO ESTÁ TUDO BEM ────────────────────────────────────────────────────────────
 *
 * Não existe estado "verde". Um selo permanente dizendo "conectado" seria decoração: quando está
 * tudo certo a própria tela já prova isso carregando, e um enfeite que fica sempre acesso é a
 * primeira coisa que o olho aprende a ignorar — e aí, no dia em que ele muda de cor, ninguém vê.
 *
 * ── O QUE CADA ESTADO MANDA A PESSOA FAZER ───────────────────────────────────────────────────
 *
 * O texto não descreve a falha, diz de quem ela é. É a diferença entre "erro de conexão", que não
 * ajuda ninguém, e "o servidor está fora, sua internet está boa", que já diz para avisar o time em
 * vez de reiniciar o roteador.
 */
const APARENCIA: Record<
  Exclude<EstadoDaConexao, "ok" | "indefinido">,
  { icone: typeof WifiOff; variante: "destructive" | "secondary"; chave: string }
> = {
  servidor_fora: { icone: CloudOff, variante: "destructive", chave: "servidorFora" },
  sem_internet: { icone: WifiOff, variante: "destructive", chave: "semInternet" },
  lenta: { icone: Gauge, variante: "secondary", chave: "lenta" },
};

export function SeloDeConexao() {
  const estado = useConexao();
  const t = useTranslations("Conexao");

  if (!precisaAvisar(estado)) return null;

  const { icone: Icone, variante, chave } = APARENCIA[estado as keyof typeof APARENCIA];

  return (
    <Badge
      variant={variante}
      className="shrink-0 gap-1.5 whitespace-nowrap"
      // `role="status"` e não `alert`: o aviso importa, mas não deve interromper quem está no meio
      // de um cadastro. Leitor de tela anuncia na primeira pausa.
      role="status"
      aria-live="polite"
      title={t(`${chave}Detalhe`)}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden />
      {/* No telefone só o ícone: a barra já carrega o menu, o nome e o botão de sair, e o texto
          empurrava o "sair" para fora da tela em aparelhos de 390px. O `title` e o texto para
          leitor de tela continuam valendo nos dois tamanhos. */}
      <span className="hidden sm:inline">{t(chave)}</span>
      <span className="sr-only sm:hidden">{t(chave)}</span>
    </Badge>
  );
}
