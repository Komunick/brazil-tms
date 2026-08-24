"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/utils";

/**
 * O aviso que aparece no canto e some sozinho (2026-08-24, a pedido).
 *
 * Primitivas do Radix, mesma família de `dialog`, `select`, `tabs` e `dropdown-menu` que já estão
 * aqui. O que se ganha ao não escrever à mão não é o desenho — é o comportamento: o temporizador que
 * PAUSA quando o ponteiro está em cima, o `aria-live` que faz o leitor de tela anunciar sem roubar o
 * foco de quem está digitando, e o descarte por arraste. Cada um desses é fácil de errar e o erro
 * aparece só para quem depende deles.
 *
 * O VIEWPORT FICA NO CANTO INFERIOR DIREITO, e é uma decisão: é o canto que não briga com o menu
 * (esquerda) nem com o cabeçalho, e é onde o olho de quem acabou de clicar num botão de salvar já
 * está — perto do rodapé dos formulários.
 */

export const ToastProvider = ToastPrimitive.Provider;

export const ToastViewport = forwardRef<
  ElementRef<typeof ToastPrimitive.Viewport>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      // No celular ele ocupa a largura e senta embaixo; no computador, o canto direito.
      "fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:w-auto sm:max-w-sm",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = "ToastViewport";

/**
 * As duas caras do aviso.
 *
 * O erro é o ÚNICO que usa a cor destrutiva, e de propósito: se sucesso também tivesse cor forte, a
 * tela ficaria piscando verde o dia inteiro e o vermelho deixaria de saltar. Sucesso é a confirmação
 * discreta de que o clique chegou; erro é a interrupção que pede leitura.
 */
export const Toast = forwardRef<
  ElementRef<typeof ToastPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & { variante?: "ok" | "erro" }
>(({ className, variante = "ok", ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      "group pointer-events-auto relative flex w-full items-start justify-between gap-3 overflow-hidden rounded-md border p-4 shadow-lg",
      // A animação inteira mora atrás de "quem não desligou movimento": quem desligou continua vendo
      // o aviso, só não vendo ele deslizar.
      "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-bottom-2",
      "motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-80",
      "data-[swipe=end]:animate-out data-[swipe=move]:transition-none",
      variante === "erro"
        ? "border-destructive/50 bg-background text-foreground"
        : "border-border bg-background text-foreground",
      className,
    )}
    {...props}
  />
));
Toast.displayName = "Toast";

export const ToastTitle = forwardRef<
  ElementRef<typeof ToastPrimitive.Title>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title ref={ref} className={cn("text-sm font-medium", className)} {...props} />
));
ToastTitle.displayName = "ToastTitle";

export const ToastDescription = forwardRef<
  ElementRef<typeof ToastPrimitive.Description>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-xs text-muted-foreground", className)}
    {...props}
  />
));
ToastDescription.displayName = "ToastDescription";

export const ToastClose = forwardRef<
  ElementRef<typeof ToastPrimitive.Close>,
  ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
      className,
    )}
    {...props}
  >
    <X className="h-3.5 w-3.5" aria-hidden />
  </ToastPrimitive.Close>
));
ToastClose.displayName = "ToastClose";
