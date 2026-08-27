"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { faltamLetras, normalizeForSearch, type SearchMode } from "@/lib/search-normalize";

/**
 * A searchable single-select over a bounded, pre-loaded option list (018, issue #25) — the shared
 * replacement for the plain resource dropdowns. Hand-rolled ARIA combobox over the existing `Input`
 * (no cmdk/popover dependency — plan R1):
 *
 * - Typing filters by CONTAINS with `normalizeForSearch` (case/accent-insensitive; `mode="plate"`
 *   also ignores hyphens/spaces) — FR-001/FR-002.
 * - When the text matches exactly ONE option's FULL label, that option is selected automatically —
 *   the paste-to-select flow (FR-003).
 * - Empty result → `emptyText` ("Nenhum resultado") — FR-004. Opening with no text shows all.
 * - Full keyboard flow: ↑/↓ move, Enter picks (a single filtered option needs no arrows), Esc
 *   closes — FR-005. Option clicks use mousedown-preventDefault so input blur can't eat them.
 * - `clearable` pins an explicit clear item (e.g. "Sem reboque" / "Todos") above the list,
 *   reachable regardless of the search text — FR-006.
 *
 * The bound `value` is always an option id (or "" — cleared); free text never becomes a value
 * (FR-007). Consumers keep their own `<Label htmlFor={id}>` wiring.
 */
export interface SearchableSelectProps {
  id: string;
  value: string;
  /**
   * Uma opção pode vir IMPEDIDA — aparece na lista, riscada, e não dá para escolher.
   *
   * Some da lista seria pior: quem procura o nome e não o acha conclui que o cadastro se perdeu e
   * vai procurar o defeito errado. Riscado, com o `hint` dizendo por quê, a pessoa entende na
   * hora. (2026-08-25, para o bloqueio de motorista.)
   */
  options: { id: string; label: string; disabled?: boolean; hint?: string }[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyText: string;
  mode?: SearchMode;
  clearable?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  /**
   * TEXTO LIVRE VIRA VALOR — a exceção, e ela é opt-in (2026-08-26, para as placas).
   *
   * O comportamento normal é estrito: o que não está na lista não pode ser escolhido, e é o certo
   * para motorista (um id do portal que não existe é uma ordem que vai falhar).
   *
   * Para PLACA é o contrário. A lista sai do que o portal já usou, e um caminhão novo — na primeira
   * viagem dele — não está lá. Recusar o que a pessoa digitou impediria justamente a atribuição que
   * ela precisa fazer, e a lista deixaria de ser ajuda para virar obstáculo.
   *
   * Com `livre`, o texto digitado que não casa com nenhuma opção é COMITADO ao sair do campo ou
   * no Enter, e passa a ser exibido como se fosse uma opção.
   */
  livre?: boolean;
  /**
   * QUANTAS LETRAS ANTES DE MOSTRAR ALGUMA COISA (2026-08-27, a pedido).
   *
   * Zero — o padrão — é o comportamento de sempre: clicar abre a lista inteira. Serve bem para
   * campos de poucas dezenas de opções, onde folhear É a forma natural de escolher.
   *
   * O motorista não é assim. São ~600 nomes, e o usuário descreveu o efeito: *"hoje só de você
   * apertar em motorista, vai todos os nomes"*. Uma lista que despeja seiscentas linhas não ajuda
   * a achar ninguém — ela obriga a digitar de qualquer jeito, depois de atrapalhar.
   *
   * ── POR QUE UM MÍNIMO, E NÃO SÓ ORDENAR MELHOR ─────────────────────────────────────────────
   *
   * Porque com seiscentos nomes NENHUMA ordem é útil: a chance de o nome procurado estar nas
   * primeiras linhas é desprezível. O que a pessoa vai fazer é digitar — e o mínimo apenas para de
   * mostrar ruído enquanto ela não digitou.
   *
   * Três letras é o número que ela pediu, e é o que separa: com duas, "sil" ainda traz meia lista.
   */
  minChars?: number;
  /** O que dizer enquanto faltam letras. Só é lido quando `minChars` > 0. */
  minCharsText?: string;
}

const CLEAR = "__clear__";

export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  placeholder,
  emptyText,
  mode = "text",
  clearable,
  clearLabel,
  disabled,
  livre,
  minChars = 0,
  minCharsText,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Com `livre`, um valor que não está na lista ainda precisa APARECER no campo.
   *
   * Sem esta segunda metade, a placa digitada à mão sumiria da tela no instante em que fosse
   * gravada — o campo voltaria a mostrar o `placeholder`, e quem digitou concluiria que se perdeu.
   */
  const selected = useMemo(
    () =>
      options.find((o) => o.id === value) ?? (livre && value ? { id: value, label: value } : null),
    [options, value, livre],
  );

  /**
   * Ainda faltam letras para buscar.
   *
   * Medido sobre o texto NORMALIZADO, não sobre o cru: "jo " e "joã" têm o mesmo tanto de letra
   * útil, e contar espaço ou acento como caractere faria o mínimo disparar em momentos diferentes
   * para a mesma intenção.
   */
  const abaixoDoMinimo = useMemo(
    () => faltamLetras(query, mode, minChars),
    [query, mode, minChars],
  );

  const filtered = useMemo(() => {
    if (abaixoDoMinimo) return [];
    const q = normalizeForSearch(query, mode);
    if (!q) return options;
    return options.filter((o) => normalizeForSearch(o.label, mode).includes(q));
  }, [options, query, mode, abaixoDoMinimo]);

  /**
   * The rendered rows: the pinned clear item (when clearable) + the filtered options (FR-006).
   *
   * O item de LIMPAR sobrevive ao mínimo de letras, de propósito: ele não é resultado de busca, é
   * uma ação fixa ("sem reboque"). Escondê-lo enquanto ninguém digitou tiraria da pessoa a única
   * coisa que ela poderia querer fazer sem procurar nada.
   */
  const rows = useMemo(
    () => (clearable && clearLabel ? [{ id: CLEAR, label: clearLabel }, ...filtered] : filtered),
    [clearable, clearLabel, filtered],
  );

  // Paste-to-select (FR-003): non-empty text matching exactly ONE option's full label picks it.
  useEffect(() => {
    if (!open) return;
    const q = normalizeForSearch(query, mode);
    if (!q) return;
    const exact = options.filter((o) => normalizeForSearch(o.label, mode) === q);
    if (exact.length === 1 && exact[0]!.id !== value) {
      onChange(exact[0]!.id);
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  }, [query, open, mode, options, value, onChange]);

  // Keep the active row in range as the filter narrows.
  useEffect(() => {
    if (activeIndex >= rows.length) setActiveIndex(0);
  }, [rows.length, activeIndex]);

  function openList() {
    if (disabled) return;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  /**
   * `comTexto` só é verdadeiro nos dois caminhos em que a pessoa TERMINOU de digitar: sair do campo
   * e Enter sem nada para escolher. Nos outros — Esc, e o `close()` que vem depois de `pick` — o
   * texto é descartado, senão sair pelo Esc gravaria o que estava escrito, que é o oposto de Esc.
   */
  function close(comTexto = false) {
    if (comTexto && livre) {
      const texto = query.trim();
      const jaExiste = rows.some(
        (r) => normalizeForSearch(r.label, mode) === normalizeForSearch(texto, mode),
      );
      if (texto !== "" && !jaExiste) onChange(texto);
    }
    setOpen(false);
    setQuery("");
  }

  function pick(rowId: string) {
    // A recusa mora AQUI, e não só no clique: o teclado chega ao mesmo lugar, e uma verificação
    // por caminho é uma verificação que o próximo caminho esquece.
    if (rows.find((r) => r.id === rowId)?.disabled) return;
    onChange(rowId === CLEAR ? "" : rowId);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // A single filtered option needs no arrowing; otherwise pick the active row.
      const target = filtered.length === 1 && query ? filtered[0] : rows[activeIndex];
      if (target) pick(target.id);
      // Nada para escolher e texto digitado: em modo livre, Enter comita o que está escrito.
      else close(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  const listboxId = `${id}-listbox`;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[activeIndex] ? `${id}-opt-${activeIndex}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : (selected?.label ?? "")}
        onFocus={openList}
        onClick={openList}
        onChange={(e) => {
          if (!open) setOpen(true);
          setQuery(e.target.value);
          setActiveIndex(0);
        }}
        onBlur={() => close(true)}
        onKeyDown={onKeyDown}
        className="pr-8"
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
      />
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={placeholder}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {rows.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground" role="presentation">
              {/*
                DUAS AUSÊNCIAS DIFERENTES, e confundi-las custaria caro.

                "Nenhum resultado" diz que a busca terminou e não achou — quem lê vai conferir a
                grafia, ou concluir que o motorista não está cadastrado. "Digite 3 letras" diz que a
                busca nem começou.

                Mostrar a primeira no lugar da segunda faria alguém desistir de procurar um nome que
                está lá, esperando ser digitado.
              */}
              {abaixoDoMinimo && minCharsText ? minCharsText : emptyText}
            </li>
          ) : (
            rows.map((row, index) => (
              <li
                key={row.id}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={row.id === value || (row.id === CLEAR && !value)}
                aria-disabled={row.disabled ? true : undefined}
                className={`rounded-sm px-2 py-1.5 text-sm ${
                  row.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                } ${index === activeIndex && !row.disabled ? "bg-accent text-accent-foreground" : ""} ${
                  row.id === CLEAR ? "text-muted-foreground" : ""
                }`}
                // preventDefault on mousedown so the input's blur doesn't close the list pre-click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(row.id)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className={row.disabled ? "line-through" : undefined}>{row.label}</span>
                {/* O motivo vai junto da linha: sem ele, "riscado" só diz que não pode, e a
                    pessoa fica sem saber o que fazer a respeito. */}
                {row.hint ? (
                  <span className="ml-2 text-xs text-muted-foreground">{row.hint}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
