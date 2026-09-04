/** Drop combining diacritics so "São Vicente" matches a typed "sao vicente". */
export const stripAccents = (s: string): string =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** Case- and accent-insensitive substring test. */
export const looseIncludes = (haystack: string, needle: string): boolean =>
  stripAccents(haystack).toLowerCase().includes(stripAccents(needle).toLowerCase());
