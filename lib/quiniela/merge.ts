import {
  SORTEO_ORDER,
  type ParsedData,
  type ProvinciaKeyInternal,
} from "./types";

const PROVINCIAS: ProvinciaKeyInternal[] = [
  "provincia",
  "ciudad",
  "cordoba",
  "santa_fe",
  "entre_rios",
  "montevideo",
];

/**
 * Fills missing province/draw cells from `fallback` without overwriting
 * values already present in `primary` (Notitimba wins when both have data).
 */
export function mergeParsedDataFromFallback(
  primary: ParsedData,
  fallback: ParsedData
): ParsedData {
  const merged: ParsedData = {
    previa: { ...primary.previa },
    primero: { ...primary.primero },
    matutina: { ...primary.matutina },
    vespertina: { ...primary.vespertina },
    nocturna: { ...primary.nocturna },
  };

  for (const sorteo of SORTEO_ORDER) {
    for (const provincia of PROVINCIAS) {
      if (merged[sorteo][provincia]) continue;
      const fromFallback = fallback[sorteo][provincia];
      if (fromFallback) {
        merged[sorteo][provincia] = fromFallback;
      }
    }
  }

  return merged;
}