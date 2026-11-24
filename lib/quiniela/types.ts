export type ProvinciaKeyInternal =
  | "provincia"
  | "ciudad"
  | "cordoba"
  | "santa_fe"
  | "entre_rios"
  | "montevideo";

export type SorteoKeyInternal =
  | "previa"
  | "primero"
  | "matutina"
  | "vespertina"
  | "nocturna";

export type ParsedData = {
  [sorteo in SorteoKeyInternal]: {
    [provincia in ProvinciaKeyInternal]?: string;
  };
};

export const SORTEO_ORDER: SorteoKeyInternal[] = [
  "previa",
  "primero",
  "matutina",
  "vespertina",
  "nocturna",
];

export function emptyParsedData(): ParsedData {
  return {
    previa: {},
    primero: {},
    matutina: {},
    vespertina: {},
    nocturna: {},
  };
}

export function parsedDataHasValues(data: ParsedData): boolean {
  for (const sorteo of Object.values(data)) {
    if (Object.keys(sorteo).length > 0) return true;
  }
  return false;
}

export function isQuinielaNumber(text: string): boolean {
  return /^\d{4,5}$/.test(text);
}

/** Montevideo often publishes 3-digit cabezas; normalize for display. */
export function normalizeQuinielaCabezas(
  text: string,
  provincia: ProvinciaKeyInternal
): string | null {
  const t = text.trim();
  if (t === "" || t === "----") return null;
  if (/^\d{4,5}$/.test(t)) return t;
  if (provincia === "montevideo" && /^\d{3}$/.test(t)) {
    return t.padStart(4, "0");
  }
  return null;
}