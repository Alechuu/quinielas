import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

/* =========================
   TYPES
========================= */

// Internal keys used during parsing
type ProvinciaKeyInternal =
  | "provincia"
  | "ciudad"
  | "cordoba"
  | "santa_fe"
  | "entre_rios"
  | "montevideo";

type SorteoKeyInternal =
  | "previa"
  | "primero"
  | "matutina"
  | "vespertina"
  | "nocturna";

// Keys expected by the table component
type ProvinciaKeyTable =
  | "Provincia"
  | "Ciudad"
  | "Cordoba"
  | "Santa Fe"
  | "Entre Rios"
  | "Montevideo";

type SorteoKeyTable =
  | "Previa"
  | "Primera"
  | "Matutina"
  | "Vespertina"
  | "Nocturna";

// Response format expected by the table
interface QuinielaResponse {
  fecha: string;
  fechaAyer: string;
  consultado: string;
  sorteos: {
    [provincia in ProvinciaKeyTable]?: {
      [sorteo in SorteoKeyTable]?: string | null;
    };
  };
  nocturnasAyer: {
    [provincia in ProvinciaKeyTable]?: string | null;
  };
}

/* =========================
   URLS
========================= */

const URL_NOTITIMBA = "https://notitimba.com/lots/";

/* =========================
   MAPPINGS
========================= */

// Maps internal key to table key (for provincia)
const PROVINCIA_TO_TABLE: Record<ProvinciaKeyInternal, ProvinciaKeyTable> = {
  provincia: "Provincia",
  ciudad: "Ciudad",
  cordoba: "Cordoba",
  santa_fe: "Santa Fe",
  entre_rios: "Entre Rios",
  montevideo: "Montevideo",
};

// Maps internal key to table key (for sorteo)
const SORTEO_TO_TABLE: Record<SorteoKeyInternal, SorteoKeyTable> = {
  previa: "Previa",
  primero: "Primera",
  matutina: "Matutina",
  vespertina: "Vespertina",
  nocturna: "Nocturna",
};

// Order of sorteos as they appear in HTML
const SORTEO_ORDER: SorteoKeyInternal[] = [
  "previa",
  "primero",
  "matutina",
  "vespertina",
  "nocturna",
];

// Expected sorteo completion times (Argentina time) + 15-min grace period
// Previa ~10:15, Primero ~12:00, Matutina ~15:00, Vespertina ~18:00, Nocturna ~21:00
const SORTEO_DEADLINE: Partial<
  Record<SorteoKeyInternal, { hours: number; minutes: number }>
> = {
  previa: { hours: 10, minutes: 30 },
  primero: { hours: 12, minutes: 15 },
  matutina: { hours: 15, minutes: 15 },
  vespertina: { hours: 18, minutes: 15 },
  nocturna: { hours: 21, minutes: 15 },
};

// AJAX endpoint for notitimba (v=1 forces the traditional results view)
const URL_NOTITIMBA_AJAX = `${URL_NOTITIMBA}cfms/aQsEq.php?v=1`;

/* =========================
   HELPER FUNCTIONS
========================= */

function getArgentinaTime(): Date {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  );
}

function getFechaString(date: Date): string {
  const dias = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  const meses = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  const diaSemana = dias[date.getDay()];
  const dia = date.getDate();
  const mes = meses[date.getMonth()];

  return `${diaSemana} ${dia} de ${mes}`;
}

function getConsultadoString(now: Date): string {
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes} hs`;
}

function getDebugNowFromRequest(request: Request): Date | null {
  const url = new URL(request.url);
  const isDebug = url.searchParams.get("debug") !== null;
  const simTime = url.searchParams.get("simTime");

  if (!isDebug || !simTime) return null;

  const match = simTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;

  const now = getArgentinaTime();
  now.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return now;
}

/* =========================
   FETCH NOTITIMBA
========================= */

interface NotitimbaFetchResult {
  staticHtml: string | null; // Full page HTML (contains historical tables like #Unoct)
  ajaxHtml: string | null; // AJAX response (today's results in qTbl tables)
}

// Fetches notitimba in two steps:
// 1. Visit /lots/ to get session cookies + the static page HTML (historical tables)
// 2. Call the AJAX endpoint with session cookies to get today's results
async function fetchNotitimbaData(): Promise<NotitimbaFetchResult> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  };

  try {
    // Step 1: Visit the page to establish a session and get cookies + static HTML
    const pageRes = await fetch(URL_NOTITIMBA, {
      cache: "no-store",
      headers,
    });

    const pageBuffer = await pageRes.arrayBuffer();
    const staticHtml = new TextDecoder("iso-8859-1").decode(pageBuffer);

    const cookies = pageRes.headers.getSetCookie?.() ?? [];
    const cookieString = cookies.map((c) => c.split(";")[0]).join("; ");

    if (!cookieString) {
      console.warn("[Quiniela] No session cookies received from notitimba.");
    }

    // Step 2: Fetch the AJAX endpoint with session cookies
    // v=1 forces the traditional results view (instead of live "sorteo virtual")
    const ajaxRes = await fetch(URL_NOTITIMBA_AJAX, {
      cache: "no-store",
      headers: {
        ...headers,
        Accept: "*/*",
        Referer: URL_NOTITIMBA,
        Cookie: cookieString,
      },
    });

    const ajaxBuffer = await ajaxRes.arrayBuffer();
    const ajaxHtml = new TextDecoder("iso-8859-1").decode(ajaxBuffer);

    return { staticHtml, ajaxHtml };
  } catch (e) {
    console.error("[Quiniela] Fetch error (notitimba):", e);
    return { staticHtml: null, ajaxHtml: null };
  }
}

/* =========================
   PARSER - Internal format
========================= */

type ParsedData = {
  [sorteo in SorteoKeyInternal]: {
    [provincia in ProvinciaKeyInternal]?: string;
  };
};

function emptyParsedData(): ParsedData {
  return {
    previa: {},
    primero: {},
    matutina: {},
    vespertina: {},
    nocturna: {},
  };
}

/* =========================
   NOTITIMBA PARSER
========================= */

function getDateString(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Match province name from notitimba HTML to internal key (handles encoding edge cases)
function matchNotitimbaProvince(text: string): ProvinciaKeyInternal | null {
  const t = text.trim().toLowerCase();
  if (t.includes("ciudad")) return "ciudad";
  if (t.includes("provincia")) return "provincia";
  if (t.includes("santa fe")) return "santa_fe";
  if (t.includes("rdoba")) return "cordoba";
  if (t.includes("entre r")) return "entre_rios";
  if (t.includes("montevideo")) return "montevideo";
  return null;
}

// Check if a sorteo should have completed by now (past its time + 15-min grace)
function isSorteoPastDeadline(sorteo: SorteoKeyInternal, now: Date): boolean {
  const deadline = SORTEO_DEADLINE[sorteo];
  if (!deadline) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const deadlineMinutes = deadline.hours * 60 + deadline.minutes;

  return currentMinutes >= deadlineMinutes;
}

// Parse the notitimba AJAX response — it returns today's results inside
// <table class="qTbl"> elements. Columns match SORTEO_ORDER:
// PREVIA, PRIMERO, MATUTINA, VESPERTINA, NOCTURNA.
// Numbers live in <div class="qTDc">NUMBER</div>; empty cells use class "qTD".
function parseNotitimbaResponse(html: string | null): ParsedData {
  const data = emptyParsedData();
  if (!html) return data;

  const $ = cheerio.load(html);

  $("table.qTbl").each((_, table) => {
    $(table)
      .find("tr")
      .each((_, row) => {
        const th = $(row).find("th").first();
        if (th.length === 0) return;

        const provinciaKey = matchNotitimbaProvince(th.text());
        if (!provinciaKey) return;

        // Each <td> corresponds to a sorteo column in order
        $(row)
          .find("td")
          .each((colIndex, cell) => {
            if (colIndex >= SORTEO_ORDER.length) return;
            const sorteo = SORTEO_ORDER[colIndex];

            const numDiv = $(cell).find(".qTDc");
            if (numDiv.length > 0) {
              const text = numDiv.text().trim();
              if (/^\d{4}$/.test(text)) {
                data[sorteo][provinciaKey] = text;
              }
            }
          });
      });
  });

  return data;
}

// Parse yesterday's nocturna from the static notitimba page.
// The #Unoct table has historical nocturna draws with dates in onclick attrs:
// <td onclick="prm('YYYY-MM-DD',idx,4)">NUMBER</td>
function parseNotitimbaNocturnaAyer(
  staticHtml: string | null,
  now: Date
): Record<ProvinciaKeyInternal, string | undefined> {
  const result: Record<string, string | undefined> = {};
  if (!staticHtml) return result as Record<ProvinciaKeyInternal, string | undefined>;

  const $ = cheerio.load(staticHtml);
  const ayer = new Date(now);
  ayer.setDate(ayer.getDate() - 1);
  const ayerDate = getDateString(ayer);

  const table = $("#Unoct");
  if (table.length === 0) return result as Record<ProvinciaKeyInternal, string | undefined>;

  table.find("tr").each((_, row) => {
    const th = $(row).find("th").first();
    if (th.length === 0) return;

    const provinciaKey = matchNotitimbaProvince(th.text());
    if (!provinciaKey) return;

    $(row)
      .find("td")
      .each((_, cell) => {
        const onclick = $(cell).attr("onclick") || "";
        if (onclick.includes(ayerDate)) {
          const text = $(cell).text().trim();
          if (/^\d{4}$/.test(text)) {
            result[provinciaKey] = text;
          }
          return false;
        }
      });
  });

  return result as Record<ProvinciaKeyInternal, string | undefined>;
}

/* =========================
   TRANSFORM TO TABLE FORMAT
========================= */

function transformToTableFormat(
  dataHoy: ParsedData,
  dataAyer: ParsedData,
  now: Date
): QuinielaResponse {
  const ayer = new Date(now);
  ayer.setDate(ayer.getDate() - 1);

  const result: QuinielaResponse = {
    fecha: getFechaString(now),
    fechaAyer: getFechaString(ayer),
    consultado: getConsultadoString(now),
    sorteos: {},
    nocturnasAyer: {},
  };

  // Initialize sorteos structure (provincia -> sorteo)
  const provincias = Object.values(PROVINCIA_TO_TABLE);
  for (const provinciaTable of provincias) {
    result.sorteos[provinciaTable] = {};
  }

  // Fill sorteos with today's data
  // Before the nocturna draw time, keep showing yesterday's nocturna values.
  const shouldUseAyerNocturnaForHoy = !isSorteoPastDeadline("nocturna", now);
  for (const sorteoInternal of SORTEO_ORDER) {
    const sorteoTable = SORTEO_TO_TABLE[sorteoInternal];

    for (const [provinciaInternal, provinciaTable] of Object.entries(
      PROVINCIA_TO_TABLE
    )) {
      const provinciaKey = provinciaInternal as ProvinciaKeyInternal;
      let value = dataHoy[sorteoInternal][provinciaKey];

      if (
        sorteoInternal === "nocturna" &&
        !value &&
        shouldUseAyerNocturnaForHoy
      ) {
        value = dataAyer.nocturna[provinciaKey];
      }

      if (value) {
        result.sorteos[provinciaTable]![sorteoTable] = value;
      }
    }
  }

  // Fill nocturnasAyer with yesterday's nocturna data
  for (const [provinciaInternal, provinciaTable] of Object.entries(
    PROVINCIA_TO_TABLE
  )) {
    const value = dataAyer.nocturna[provinciaInternal as ProvinciaKeyInternal];
    if (value) {
      result.nocturnasAyer[provinciaTable] = value;
    }
  }

  return result;
}

/* =========================
   GET ROUTE
========================= */

export async function GET(request: Request) {
  try {
    const now = getDebugNowFromRequest(request) ?? getArgentinaTime();

    const { staticHtml, ajaxHtml } = await fetchNotitimbaData();

    const dataHoy = parseNotitimbaResponse(ajaxHtml);

    const dataAyer = emptyParsedData();
    const nocturnaAyer = parseNotitimbaNocturnaAyer(staticHtml, now);
    for (const [provincia, value] of Object.entries(nocturnaAyer)) {
      if (value) {
        dataAyer.nocturna[provincia as ProvinciaKeyInternal] = value;
      }
    }

    const response = transformToTableFormat(dataHoy, dataAyer, now);

    return NextResponse.json(response);
  } catch (e) {
    console.error(e);

    return NextResponse.json({ error: "Error quiniela" }, { status: 500 });
  }
}
