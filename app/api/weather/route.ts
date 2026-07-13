import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BERISSO_LAT = -34.8764;
const BERISSO_LON = -57.8831;

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
}

function getWeatherDescription(code: number): string {
  if (code === 0) return "Despejado";
  if (code <= 3) return "Nublado";
  if (code <= 48) return "Niebla";
  if (code <= 57) return "Llovizna";
  if (code <= 67) return "Lluvia";
  if (code <= 77) return "Nieve";
  if (code <= 82) return "Chaparrones";
  if (code <= 86) return "Nevadas";
  if (code <= 99) return "Tormenta";
  return "Variable";
}

export async function GET() {
  const params = new URLSearchParams({
    latitude: String(BERISSO_LAT),
    longitude: String(BERISSO_LON),
    current: "temperature_2m,weather_code",
    timezone: "America/Argentina/Buenos_Aires",
  });

  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
      { next: { revalidate: 600 } }
    );

    if (!response.ok) {
      throw new Error("No se pudo obtener el clima");
    }

    const data = (await response.json()) as OpenMeteoResponse;
    const temperature = data.current?.temperature_2m;
    const weatherCode = data.current?.weather_code;

    if (temperature === undefined) {
      throw new Error("Datos de clima incompletos");
    }

    return NextResponse.json({
      location: "Berisso",
      temperature: Math.round(temperature),
      weatherCode: weatherCode ?? null,
      description:
        weatherCode !== undefined ? getWeatherDescription(weatherCode) : null,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar el clima" },
      { status: 502 }
    );
  }
}
