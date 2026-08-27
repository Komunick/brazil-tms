/**
 * Search-text normalization for the searchable resource pickers (018, issue #25; spec FR-002).
 * Pure and client-safe — used by `SearchableSelect` to compare user input against option labels.
 *
 * - `"text"` (names): strip diacritics (NFD), lowercase, trim, collapse internal whitespace — so a
 *   pasted "  JOÃO  da Silva " matches "João da Silva".
 * - `"plate"` (vehicle/trailer plates): the above PLUS strip hyphens/spaces entirely — so
 *   "abc-1234", "ABC 1234" and "abc1234" all normalize to "abc1234".
 * - `"digits"` (phones/documents, stored bare): keep digits only — so a typed "(11) 99999-8888"
 *   matches the stored "11999998888". Yields "" when the input carries no digit at all.
 */
export type SearchMode = "text" | "plate" | "digits";

export function normalizeForSearch(text: string, mode: SearchMode = "text"): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  if (mode === "plate") return base.replace(/[-\s]/g, "");
  if (mode === "digits") return base.replace(/\D/g, "");
  return base;
}

/**
 * AINDA FALTAM LETRAS PARA BUSCAR? (2026-08-27, a pedido)
 *
 * O campo de motorista lista ~600 nomes, e o usuário descreveu o efeito: *"hoje só de você apertar
 * em motorista, vai todos os nomes"*. Com seiscentas linhas nenhuma ordem ajuda — o que a pessoa
 * vai fazer é digitar, e o mínimo apenas para de mostrar ruído enquanto ela não digitou.
 *
 * ── CONTA SOBRE O TEXTO NORMALIZADO, E ESSA É A DECISÃO ───────────────────────────────────────
 *
 * `"jo "` e `"joã"` têm o mesmo tanto de letra útil. Contar `query.length` cru faria o mínimo
 * disparar em momentos diferentes para a mesma intenção: um espaço a mais liberaria a busca sem
 * que nada tivesse sido digitado de fato, e o acento contaria como caractere em algumas telas e não
 * em outras.
 *
 * ── `minChars = 0` DESLIGA ────────────────────────────────────────────────────────────────────
 *
 * É o padrão, e mantém o comportamento de sempre para os campos de poucas opções — veículo,
 * reboque, transportadora — onde folhear a lista É a forma natural de escolher.
 */
export function faltamLetras(query: string, mode: SearchMode, minChars: number): boolean {
  if (minChars <= 0) return false;
  return normalizeForSearch(query, mode).length < minChars;
}
