import { describe, expect, it } from "vitest";
import { readableStopName, stripCode } from "./stopNames.ts";

// real streets, looked up from OSM via Nominatim
const AV_MAR = "Avenida do Mar e das Comunidades Madeirenses";
const GALEAO = "Rua da Escola Secundária do Galeão";
const ALECRINS = "Travessa Ribeiro dos Alecrins";

describe("stripCode", () => {
  it("drops the operator's inline code", () => {
    expect(stripCode("AV Mar  E E M (11)", "11")).toBe("AV Mar  E E M");
  });

  it("keeps a parenthetical that isn't the code", () => {
    expect(stripCode("Galeão (Escola)", "125")).toBe("Galeão (Escola)");
  });

  it("keeps everything when there is no code", () => {
    expect(stripCode("Galeão (Escola)")).toBe("Galeão (Escola)");
  });

  it("never returns an empty name", () => {
    expect(stripCode("(11)", "11")).toBe("(11)");
  });
});

describe("readableStopName", () => {
  it("expands an abbreviated street and keeps what distinguishes the stop", () => {
    // the case that started this
    expect(readableStopName("AV Mar  E E M (11)", AV_MAR, "11")).toBe(`${AV_MAR} — E E M`);
  });

  it("uses the street alone when it already says everything", () => {
    expect(readableStopName("Galeão (Escola)", GALEAO)).toBe(GALEAO);
  });

  it("leaves the operator name alone when the street can't corroborate it", () => {
    // a stop on Travessa Ribeiro dos Alecrins whose name is about something
    // else entirely — renaming it would point the rider at the wrong sign
    expect(readableStopName("Hotel Baia Azul  D (24)", ALECRINS, "24")).toBe(
      "Hotel Baia Azul  D",
    );
  });

  it("falls back cleanly with no street at all", () => {
    expect(readableStopName("AV Mar  E E M (11)", undefined, "11")).toBe("AV Mar  E E M");
    expect(readableStopName("AV Mar  E E M (11)", "", "11")).toBe("AV Mar  E E M");
  });

  it("matches accent- and case-insensitively", () => {
    expect(readableStopName("AV MAR  E E M", AV_MAR)).toBe(`${AV_MAR} — E E M`);
  });

  it("expands the other operator abbreviations", () => {
    expect(readableStopName("TV Alecrins", ALECRINS)).toBe(ALECRINS);
    expect(readableStopName("TV Alecrins  Norte", ALECRINS)).toBe(`${ALECRINS} — Norte`);
  });

  it("refuses when the abbreviation names a different kind of street", () => {
    // "R" expands to Rua, but this is a Travessa — corroboration fails, so
    // the operator's name stands
    expect(readableStopName("R Alecrins  Norte", ALECRINS)).toBe("R Alecrins  Norte");
  });

  it("does not treat a one-letter token as evidence", () => {
    // "E" appears in the street as a connective; it must not consume
    const out = readableStopName("AV Mar  E E M", AV_MAR);
    expect(out.endsWith("— E E M")).toBe(true);
  });

  it("refuses a street that shares only a connective", () => {
    expect(readableStopName("Pinga", AV_MAR)).toBe("Pinga");
  });

  it("does not rename every stop on a street to the street", () => {
    // two different stops on one avenue must stay distinguishable
    const a = readableStopName("AV Mar  E E M (11)", AV_MAR, "11");
    const b = readableStopName("AV Mar  Alfândega (13)", AV_MAR, "13");
    expect(a).not.toBe(b);
    expect(a).toContain("E E M");
    expect(b).toContain("Alfândega");
  });

  // Real regressions found scanning the full build output — a road-type word
  // ("Avenida", "Caminho"...) is not, by itself, evidence of *which* street.
  it("refuses a match built from the road type alone", () => {
    // "AV do Amparo" was renamed onto the unrelated "Avenida Mário Soares",
    // which happens to be the nearest OSM way but isn't this street at all —
    // "avenida" matched, but nothing else did
    expect(readableStopName("AV do Amparo  S (1361A)", "Avenida Mário Soares", "1361A")).toBe(
      "AV do Amparo  S",
    );
  });

  it("does not let a connective stop the run before a real word is checked", () => {
    // was: "Caminho da Igreja — da Igreja S" (the connective broke the match
    // right before "Igreja" could be checked, duplicating it in the output)
    expect(readableStopName("CAM da Igreja  S (996)", "Caminho da Igreja", "996")).toBe(
      "Caminho da Igreja — S",
    );
  });

  it("lets a street spell out a connective the operator's shorthand dropped", () => {
    expect(readableStopName("CAM Amparo", "Caminho do Amparo")).toBe("Caminho do Amparo");
  });
});
