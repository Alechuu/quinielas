import {
  emptyParsedData,
  normalizeQuinielaCabezas,
  type ParsedData,
  type ProvinciaKeyInternal,
  type SorteoKeyInternal,
} from "./types";

const DEJUGADAS_CABEZAS_URL =
  "https://dejugadas.com/api/juegos/cabezasDiarias";

const DEJUGADAS_JUEGO_TO_PROVINCIA: Record<string, ProvinciaKeyInternal> = {
  "1": "ciudad",
  "2": "provincia",
  "3": "santa_fe",
  "4": "montevideo",
  "5": "entre_rios",
  "7": "cordoba",
};

const DEJUGADAS_MOMENTO_TO_SORTEO: Record<string, SorteoKeyInternal> = {
  momento_5: "previa",
  momento_1: "primero",
  momento_2: "matutina",
  momento_3: "vespertina",
  momento_4: "nocturna",
};

export interface DejugadasCabezasResponse {
  error: number;
  datos?: Record<
    string,
    Record<string, string | undefined> | undefined
  >;
}

export function parseDejugadasCabezasResponse(
  json: DejugadasCabezasResponse | null | undefined
): ParsedData {
  const data = emptyParsedData();
  if (!json || json.error !== 0 || !json.datos) return data;

  for (const [juegoId, sorteos] of Object.entries(json.datos)) {
    const provincia = DEJUGADAS_JUEGO_TO_PROVINCIA[juegoId];
    if (!provincia || !sorteos) continue;

    for (const [momentoKey, sorteo] of Object.entries(
      DEJUGADAS_MOMENTO_TO_SORTEO
    )) {
      const raw = sorteos[momentoKey];
      if (typeof raw !== "string") continue;
      const value = normalizeQuinielaCabezas(raw, provincia);
      if (value) {
        data[sorteo][provincia] = value;
      }
    }
  }

  return data;
}

export async function fetchDejugadasCabezas(
  fecha: string
): Promise<ParsedData | null> {
  const url = `${DEJUGADAS_CABEZAS_URL}?fecha=${encodeURIComponent(fecha)}`;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
  };

  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      console.warn(
        `[Quiniela] Dejugadas respondió HTTP ${res.status} (${url})`
      );
      return null;
    }
    const json = (await res.json()) as DejugadasCabezasResponse;
    if (json.error !== 0) {
      console.warn("[Quiniela] Dejugadas JSON error != 0");
      return null;
    }
    return parseDejugadasCabezasResponse(json);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Error de red";
    console.warn("[Quiniela] Dejugadas fallback no disponible:", detail);
    return null;
  }
}