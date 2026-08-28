"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import type { Role } from "@brazil-tms/shared";
import { ListaDeNavegacao } from "@/components/shell/app-sidebar";

/**
 * A NAVEGAÇÃO NO TELEFONE (2026-08-28, a pedido).
 *
 * A barra lateral tem 256px fixos e some abaixo de `md` — ver o comentário no `AppSidebar`. Aqui
 * está o que entra no lugar dela: um botão na barra de topo que abre a mesma lista numa gaveta.
 *
 * ── POR QUE RADIX DIALOG, E NÃO UMA `<div>` COM `translate-x` ─────────────────────────────────
 *
 * A gaveta é um modal, e modal tem obrigações que ninguém lembra de escrever à mão: prender o foco
 * dentro dela, devolver o foco ao botão quando fecha, fechar no Esc, travar a rolagem do fundo e
 * marcar o resto da página como inerte para o leitor de tela. O `@radix-ui/react-dialog` já é
 * dependência do projeto — usá-lo aqui não acrescenta peso e evita reescrever tudo isso pior.
 *
 * NÃO virou uma primitiva `ui/sheet`: existe UM uso. A regra dos três (`docs/PRINCIPLES.md`) diz
 * para extrair no terceiro, não no primeiro. O `ui/dialog.tsx` que já existe não serve porque é um
 * modal centralizado — a forma errada para uma gaveta colada na borda.
 *
 * ── FECHAR AO NAVEGAR, POR DUAS VIAS ──────────────────────────────────────────────────────────
 *
 * O clique no item fecha (`aoNavegar`), e o efeito sobre o `pathname` fecha de novo. Parece
 * redundância e não é: o primeiro cobre o caminho normal; o segundo cobre voltar pelo botão do
 * aparelho e qualquer navegação que não venha de um clique na lista. Sem ele, a pessoa volta uma
 * página e continua olhando para o menu aberto.
 */
export function MenuMovel({ role }: { role: Role }) {
  // Duas origens de propósito: "Abrir/Fechar menu" são rótulos do shell e já viviam em `Shell`;
  // o nome do app é `Common`, o mesmo que a barra lateral usa no cabeçalho dela.
  const t = useTranslations("Shell");
  const tCommon = useTranslations("Common");
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  return (
    <Dialog.Root open={aberto} onOpenChange={setAberto}>
      {/* `md:hidden` porque acima disso a barra lateral está na tela e um segundo caminho para a
          mesma navegação só confunde. */}
      <Dialog.Trigger
        className="-ml-1 rounded-md p-2 text-foreground/70 transition-colors hover:bg-accent hover:text-foreground md:hidden"
        aria-label={t("openMenu")}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] md:hidden" />
        <Dialog.Content
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl focus:outline-none md:hidden"
          aria-describedby={undefined}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
            {/* O título é obrigatório para o leitor de tela; visualmente o nome do app já basta. */}
            <Dialog.Title className="text-[0.95rem] font-semibold tracking-tight text-white">
              {tCommon("appName")}
            </Dialog.Title>
            <Dialog.Close
              className="rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              aria-label={t("closeMenu")}
            >
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </div>

          {/* Nunca recolhida: a gaveta é chamada por quem quer LER os nomes. Uma coluna de ícones
              num telefone seria a pior das duas opções — ocupa a tela e não diz o que faz. */}
          <ListaDeNavegacao role={role} aoNavegar={() => setAberto(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
