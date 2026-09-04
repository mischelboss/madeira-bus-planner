/**
 * Readable stop names, derived — never invented.
 *
 * Operator stop names are abbreviated and carry their code inline:
 * "AV Mar  E E M (11)", "R J Dias Leite  Rotunda (33A)". The street each stop
 * stands on comes from OpenStreetMap via Nominatim (`geocode -- --roads`), so
 * "Avenida do Mar e das Comunidades Madeirenses" is a fact we looked up, not a
 * guess at what "AV Mar" might stand for.
 *
 * The rule is deliberately conservative: the street name is only used when the
 * operator's own words are found inside it. "AV Mar" -> Avenida + Mar, both
 * present in that street, so the substitution is corroborated. Where it isn't,
 * the operator's name is left exactly as it is — a stop sign a rider can read
 * beats a prettier name that points somewhere else.
 */

import { stripAccents } from "./text.ts";

/** Leading abbreviations used by the operators, expanded to the street words
 *  they stand for. Only entries confirmed against real OSM street names. */
const ABBREVIATIONS: Record<string, string> = {
  av: "avenida",
  r: "rua",
  rua: "rua",
  estr: "estrada",
  est: "estrada",
  cam: "caminho",
  cm: "caminho",
  pc: "praca",
  praca: "praca",
  lg: "largo",
  tv: "travessa",
  trav: "travessa",
  lev: "levada",
  bec: "beco",
  rot: "rotunda",
  imp: "impasse",
};

/** Portuguese connectives — present in street names, absent from the
 *  abbreviated operator names. They pass through a match freely (a street
 *  is allowed to insert "da"/"do" that the operator's shorthand dropped)
 *  but never count as the evidence that justifies one. */
const STOPWORDS = new Set(["do", "da", "de", "dos", "das", "e", "o", "a", "no", "na"]);

/** The road-*type* words themselves. "Avenida" tells you this is some
 *  avenue, not which one — on its own it would corroborate a match against
 *  any avenue on the island, which is exactly how "AV do Amparo" nearly
 *  got renamed onto the unrelated "Avenida Mário Soares". */
const ROAD_TYPE_WORDS = new Set(Object.values(ABBREVIATIONS));

const norm = (s: string) => stripAccents(s).toLowerCase();

function tokens(s: string): string[] {
  return norm(s)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Expand a leading abbreviation; other tokens pass through. */
const expand = (t: string, first: boolean): string =>
  first && ABBREVIATIONS[t] ? ABBREVIATIONS[t] : t;

/** A one-letter token (direction/code suffixes like "S", "D", "A") proves
 *  nothing about which street this is, and normally marks the end of the
 *  place-name part of the operator's text. */
const isNamePart = (t: string) => t.length >= 2;

/** Evidence a match is genuinely *this* street, not just some street of the
 *  right type — a connective or the type word alone doesn't count. */
const isSpecific = (t: string) => isNamePart(t) && !STOPWORDS.has(t) && !ROAD_TYPE_WORDS.has(t);

/** Strip the operator's inline "(code)" when it really is this stop's code. */
export function stripCode(name: string, code?: string): string {
  if (!code) return name.trim();
  const trimmed = name.replace(/\s*\(([^()]*)\)\s*$/, (m, inner: string) =>
    norm(inner) === norm(code) ? "" : m,
  );
  return trimmed.trim() || name.trim();
}

/**
 * A readable name for a stop, or the operator's name unchanged when the
 * street cannot corroborate it.
 *
 * Two ways the street wins:
 *  - every identifying word of the operator name appears in the street, so
 *    the street simply says the same thing better ("Galeao (Escola)" ->
 *    "Rua da Escola Secundaria do Galeao");
 *  - a leading run of them does, and the rest distinguishes this stop from
 *    others on the same street ("AV Mar  E E M" -> "Avenida do Mar e das
 *    Comunidades Madeirenses — E E M").
 */
export function readableStopName(
  operatorName: string,
  road: string | undefined,
  code?: string,
): string {
  const base = stripCode(operatorName, code);
  if (!road?.trim()) return base;

  const roadTokens = tokens(road);
  if (roadTokens.length === 0) return base;
  const roadSet = new Set(roadTokens);

  const raw = tokens(base);
  const expanded = raw.map((t, i) => expand(t, i === 0));
  if (!expanded.some(isSpecific)) return base; // nothing to corroborate against at all

  // (1) the street already says everything the operator name says. Every
  //     token has to be accounted for, short ones included — "E E M" is not
  //     evidence of *which* street, but a stray "M" the road doesn't have
  //     means the street doesn't actually say everything, and rule (2)'s
  //     leading-run match should get a chance to keep it as a suffix instead.
  if (expanded.every((t) => roadSet.has(t))) return road.trim();

  // (2) a leading run matches, in order. Connectives ("da", "do") pass
  //     through without needing to appear at that exact position — a street
  //     is allowed to spell out what the operator's shorthand dropped. The
  //     run must include at least one *specific* word, or "AV do Amparo"
  //     would match the first avenue Nominatim finds nearby.
  let consumed = 0;
  let cursor = 0;
  for (let i = 0; i < expanded.length; i++) {
    const t = expanded[i];
    if (!isNamePart(t)) break;
    if (STOPWORDS.has(t)) {
      consumed = i + 1;
      continue;
    }
    const at = roadTokens.indexOf(t, cursor);
    if (at === -1) break;
    cursor = at + 1;
    consumed = i + 1;
  }
  if (consumed === 0 || !expanded.slice(0, consumed).some(isSpecific)) return base;

  // rebuild the remainder from the original words, not the normalised ones
  const parts = base.split(/\s+/).filter(Boolean);
  const rest = parts.slice(consumed).join(" ").trim();
  return rest ? `${road.trim()} — ${rest}` : road.trim();
}

/** What to show a rider: the readable form when we have one, else the sign. */
export const stopLabel = (s: { name: string; displayName?: string }): string =>
  s.displayName ?? s.name;
