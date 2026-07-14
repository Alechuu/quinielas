"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { RefreshCw, Sun, Cloud, CloudSun, CloudFog, CloudDrizzle, CloudRain, Snowflake, CloudLightning, type LucideIcon } from "lucide-react";

const API_URL = "/api/cabezas";
const AUTO_SYNC_INTERVAL = 60 * 60 * 1000;
const MANUAL_OVERRIDE_KEY = "cabezasManualOverrideDate";

import type { CabezasSyncError } from "@/lib/cabezas/types";

interface CabezasResponse {
  numerazo?: string;
  laFija?: string;
  elEspecial?: string;
  source?: "instagram" | "manual";
  updatedAt?: string;
  syncOk?: boolean;
  syncError?: CabezasSyncError;
}

function getArgentinaDateKey(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function getArgentinaTimeParts(): { hours: string; minutes: string } {
  const now = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  );
  return {
    hours: String(now.getHours()).padStart(2, "0"),
    minutes: String(now.getMinutes()).padStart(2, "0"),
  };
}

const TEXT_SHADOW = "0 2px 6px rgba(0,0,0,0.9)";

function getWeatherIcon(code: number | null): LucideIcon {
  if (code === null) return Cloud;
  if (code === 0) return Sun;
  if (code <= 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code <= 48) return CloudFog;
  if (code <= 57) return CloudDrizzle;
  if (code <= 67) return CloudRain;
  if (code <= 77) return Snowflake;
  if (code <= 82) return CloudRain;
  if (code <= 86) return Snowflake;
  if (code <= 99) return CloudLightning;
  return Cloud;
}

function WeatherSkeleton() {
  return (
    <div className="flex w-full flex-col items-center gap-2.5">
      <div className="h-7 w-7 rounded-full bg-white/30 animate-pulse" />
      <div className="h-7 w-16 rounded bg-white/30 animate-pulse" />
      <div className="h-4 w-32 rounded bg-white/25 animate-pulse" />
    </div>
  );
}

function DigitalClock({ quinielaRefreshKey }: { quinielaRefreshKey: number }) {
  const initial = getArgentinaTimeParts();
  const hoursRef = useRef<HTMLSpanElement>(null);
  const minutesRef = useRef<HTMLSpanElement>(null);
  const lastTimeRef = useRef(initial);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [weatherDescription, setWeatherDescription] = useState<string | null>(
    null
  );
  const [weatherCode, setWeatherCode] = useState<number | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const next = getArgentinaTimeParts();
      const prev = lastTimeRef.current;

      if (next.hours !== prev.hours && hoursRef.current) {
        hoursRef.current.textContent = next.hours;
      }
      if (next.minutes !== prev.minutes && minutesRef.current) {
        minutesRef.current.textContent = next.minutes;
      }
      lastTimeRef.current = next;

      const msToNextMinute = (() => {
        const now = new Date(
          new Date().toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
          })
        );
        return (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50;
      })();
      timeoutId = setTimeout(tick, msToNextMinute);
    };

    tick();

    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadWeather = async () => {
      setWeatherLoading(true);

      try {
        const response = await fetch("/api/weather", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as {
          temperature?: number;
          description?: string | null;
          weatherCode?: number | null;
        };

        if (cancelled) return;

        if (typeof data.temperature === "number") {
          setTemperature(data.temperature);
        }
        if (data.description) {
          setWeatherDescription(data.description);
        }
        if (typeof data.weatherCode === "number") {
          setWeatherCode(data.weatherCode);
        }
      } catch {
        // El reloj sigue funcionando aunque falle el clima.
      } finally {
        if (!cancelled) {
          setWeatherLoading(false);
        }
      }
    };

    void loadWeather();

    return () => {
      cancelled = true;
    };
  }, [quinielaRefreshKey]);

  const WeatherIcon = getWeatherIcon(weatherCode);

  return (
    <div className="rounded-xl border-2 border-white/80 bg-emerald-950/85 px-4 py-4 shadow-lg backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <div
          className="text-white font-black text-4xl md:text-5xl font-mono tracking-wider tabular-nums leading-none"
          style={{ textShadow: TEXT_SHADOW, contain: "paint" }}
        >
          <span ref={hoursRef}>{initial.hours}</span>:
          <span ref={minutesRef}>{initial.minutes}</span>
        </div>

        {(weatherLoading || temperature !== null) && (
          <>
            <div className="h-px w-full bg-white/50" />
            {weatherLoading ? (
              <WeatherSkeleton />
            ) : (
              temperature !== null && (
                <div className="flex w-full flex-col items-center gap-2 text-center">
                  <WeatherIcon
                    className="h-7 w-7 md:h-8 md:w-8 shrink-0 text-white"
                    style={{
                      filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.8))",
                    }}
                    aria-hidden
                  />
                  <div
                    className="text-white font-black text-2xl md:text-3xl font-mono tabular-nums leading-none"
                    style={{ textShadow: TEXT_SHADOW }}
                  >
                    {temperature}°C
                  </div>
                  <p
                    className="text-sm md:text-base font-bold text-white tracking-wide leading-tight"
                    style={{ textShadow: TEXT_SHADOW }}
                  >
                    {[weatherDescription, "Berisso"].filter(Boolean).join(" · ")}
                  </p>
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

function applyCabezasToState(
  data: CabezasResponse,
  setNumerazo: (value: string) => void,
  setLaFija: (value: string) => void,
  setElEspecial: (value: string) => void
) {
  const numerazo = data.numerazo ?? "";
  const laFija = data.laFija ?? "";
  const elEspecial = data.elEspecial ?? "";

  setNumerazo(numerazo);
  setLaFija(laFija);
  setElEspecial(elEspecial);

  localStorage.setItem("numerazo", numerazo);
  localStorage.setItem("laFija", laFija);
  localStorage.setItem("elEspecial", elEspecial);
}

export function SidebarPanel({
  quinielaRefreshKey,
}: {
  quinielaRefreshKey: number;
}) {
  const [numerazo, setNumerazo] = useState("");
  const [laFija, setLaFija] = useState("");
  const [elEspecial, setElEspecial] = useState("");
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const manualOverrideRef = useRef(false);

  const hasManualOverrideToday = useCallback(() => {
    return localStorage.getItem(MANUAL_OVERRIDE_KEY) === getArgentinaDateKey();
  }, []);

  const markManualOverride = useCallback(() => {
    manualOverrideRef.current = true;
    localStorage.setItem(MANUAL_OVERRIDE_KEY, getArgentinaDateKey());
  }, []);

  const persistManualValues = useCallback(
    async (values: { numerazo: string; laFija: string; elEspecial: string }) => {
      markManualOverride();

      localStorage.setItem("numerazo", values.numerazo);
      localStorage.setItem("laFija", values.laFija);
      localStorage.setItem("elEspecial", values.elEspecial);

      try {
        await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
      } catch {
        // La edición local sigue disponible aunque falle el guardado remoto.
      }
    },
    [markManualOverride]
  );

  const loadFromApi = useCallback(
    async (sync = false, force = false) => {
      if (sync && hasManualOverrideToday() && !force) {
        return;
      }

      if (sync) {
        setRefreshing(true);
      }

      try {
        const params = new URLSearchParams();
        if (sync) params.set("sync", "1");
        if (force) params.set("force", "1");
        const query = params.toString();
        const url = query ? `${API_URL}?${query}` : API_URL;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("No se pudo cargar las cabezas");
        }

        const data = (await response.json()) as CabezasResponse;

        if (!hasManualOverrideToday() || force) {
          applyCabezasToState(data, setNumerazo, setLaFija, setElEspecial);
        }
      } catch {
        // La edición manual sigue disponible aunque falle la sincronización.
      } finally {
        if (sync) {
          setRefreshing(false);
        }
      }
    },
    [hasManualOverrideToday]
  );

  useEffect(() => {
    const numerazoGuardado = localStorage.getItem("numerazo") || "";
    const laFijaGuardada = localStorage.getItem("laFija") || "";
    const elEspecialGuardado = localStorage.getItem("elEspecial") || "";

    setNumerazo(numerazoGuardado);
    setLaFija(laFijaGuardada);
    setElEspecial(elEspecialGuardado);
    manualOverrideRef.current = hasManualOverrideToday();

    loadFromApi(true);
  }, [hasManualOverrideToday, loadFromApi]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadFromApi(true);
    }, AUTO_SYNC_INTERVAL);

    return () => clearInterval(interval);
  }, [loadFromApi]);

  const handleNumerazoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setNumerazo(valor);
    void persistManualValues({
      numerazo: valor,
      laFija,
      elEspecial,
    });
  };

  const handleLaFijaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setLaFija(valor);
    void persistManualValues({
      numerazo,
      laFija: valor,
      elEspecial,
    });
  };

  const handleElEspecialChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setElEspecial(valor);
    void persistManualValues({
      numerazo,
      laFija,
      elEspecial: valor,
    });
  };

  const handleRefresh = () => {
    localStorage.removeItem(MANUAL_OVERRIDE_KEY);
    manualOverrideRef.current = false;
    void loadFromApi(true, true);
  };

  return (
    <div className="relative h-full rounded-2xl overflow-hidden flex flex-col items-center pt-4 px-4 pb-3 shadow-2xl border-4 border-emerald-300 bg-linear-to-b from-emerald-50 via-green-100 to-emerald-200">
      <div className="absolute inset-0 opacity-60 rounded-2xl overflow-hidden">
        <Image
          src="/grillo.png"
          alt="Grillo de la suerte"
          fill
          className="object-cover"
          priority
        />
      </div>
      <div className="absolute inset-0 bg-linear-to-b from-emerald-900/28 via-emerald-900/22 to-emerald-950/30 rounded-2xl" />

      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        aria-label="Actualizar cabezas del día"
        className="absolute top-3 right-3 z-20 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/50 bg-white/20 text-white shadow-md backdrop-blur-sm transition-colors hover:bg-white/35 hover:border-white/70 active:scale-95 disabled:opacity-60 disabled:active:scale-100"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
      </button>

      <div className="relative z-10 flex flex-col flex-1 w-full text-center min-h-0">
        <div className="space-y-4">
          <div>
            <p
              className="text-emerald-50 font-black text-3xl md:text-4xl mb-1 tracking-wider"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
            >
              EL NUMERAZO
            </p>
            <input
              type="text"
              value={numerazo}
              onChange={handleNumerazoChange}
              onFocus={() => setFocusedInput("numerazo")}
              onBlur={() => setFocusedInput(null)}
              placeholder="-"
              style={{
                caretColor:
                  focusedInput === "numerazo" ? "auto" : "transparent",
                textShadow: "0 1px 2px rgba(0,0,0,0.35)",
              }}
              className="text-5xl md:text-6xl font-black text-blue-950 bg-transparent border-none text-center w-full outline-none px-2 py-1"
            />
          </div>

          <div>
            <p
              className="text-emerald-50 font-black text-3xl md:text-4xl mb-1 tracking-wider"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
            >
              LA FIJA
            </p>
            <input
              type="text"
              value={laFija}
              onChange={handleLaFijaChange}
              onFocus={() => setFocusedInput("laFija")}
              onBlur={() => setFocusedInput(null)}
              placeholder="-"
              style={{
                caretColor: focusedInput === "laFija" ? "auto" : "transparent",
                textShadow: "0 1px 2px rgba(0,0,0,0.35)",
              }}
              className="text-4xl md:text-5xl font-black text-blue-950 bg-transparent border-none text-center w-full outline-none px-2 py-1"
            />
          </div>

          <div>
            <p
              className="text-emerald-50 font-black text-3xl md:text-4xl mb-1 tracking-wider"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
            >
              EL ESPECIAL
            </p>
            <input
              type="text"
              value={elEspecial}
              onChange={handleElEspecialChange}
              onFocus={() => setFocusedInput("elEspecial")}
              onBlur={() => setFocusedInput(null)}
              placeholder="-"
              style={{
                caretColor:
                  focusedInput === "elEspecial" ? "auto" : "transparent",
                textShadow: "0 1px 2px rgba(0,0,0,0.35)",
              }}
              className="text-4xl md:text-5xl font-black text-blue-950 bg-transparent border-none text-center w-full outline-none px-2 py-1"
            />
            <div className="mt-3 w-full">
              <DigitalClock quinielaRefreshKey={quinielaRefreshKey} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
