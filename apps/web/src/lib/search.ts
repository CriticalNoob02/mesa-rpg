/** Minúsculas e sem acento: "Bola de Fogo" e "bola de fogo" casam. */
export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca nos dois idiomas: casa se a consulta aparece em qualquer um dos textos. */
export function matches(query: string, ...texts: (string | null | undefined)[]) {
  const q = normalize(query.trim());
  return !q || texts.some((t) => t && normalize(t).includes(q));
}

/** Ordena pelo texto em português (com acentos no lugar certo). */
export const byPt =
  <T>(get: (x: T) => string) =>
  (a: T, b: T) =>
    get(a).localeCompare(get(b), "pt-BR");
