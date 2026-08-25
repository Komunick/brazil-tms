"use client";

import { useEffect } from "react";
import { gravarNovidadesVistas } from "@/lib/novidades/visto";

/**
 * Carimba a visita, e não desenha nada.
 *
 * Fica separado da lista de propósito: assim a lista inteira continua sendo desenhada no servidor, e
 * o único pedaço que precisa de navegador é esta linha. Um componente cliente envolvendo a página
 * toda custaria o mesmo carimbo e mandaria as dezesseis entradas pelo fio duas vezes.
 *
 * O carimbo sai no efeito, DEPOIS da pintura: gravá-lo durante o render tiraria os selos da mesma
 * carga em que a pessoa veio vê-los.
 */
export function MarcarComoVisto({ data }: { data: string }) {
  useEffect(() => {
    gravarNovidadesVistas(data);
  }, [data]);

  return null;
}
