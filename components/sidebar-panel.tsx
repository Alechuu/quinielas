"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";

const API_URL = "/api/cabezas";
const AUTO_SYNC_INTERVAL = 60 * 60 * 1000;
const MANUAL_OVERRIDE_KEY = "cabezasManualOverrideDate";

interface CabezasResponse {
  numerazo?: string;
  laFija?: string;
  elEspecial?: string;
  source?: "instagram" | "manual";
  updatedAt?: string;
  syncError?: string;
}

function getArgentinaDateKey(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function formatLastUpdated(iso: string): string {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")}/${get("month")}/${get("year")} - ${get("hour")}:${get("minute")}`;
}

function getArgentinaTimeParts(): {
  hours: string;
  minutes: string;
  seconds: string;
} {
  const now = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  );
  return {
    hours: String(now.getHours()).padStart(2, "0"),
    minutes: String(now.getMinutes()).padStart(2, "0"),
    seconds: String(now.getSeconds()).padStart(2, "0"),
  };
}

function DigitalClock() {
  const initial = getArgentinaTimeParts();
  const hoursRef = useRef<HTMLSpanElement>(null);
  const minutesRef = useRef<HTMLSpanElement>(null);
  const secondsRef = useRef<HTMLSpanElement>(null);
  const lastTimeRef = useRef(initial);

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
      if (next.seconds !== prev.seconds && secondsRef.current) {
        secondsRef.current.textContent = next.seconds;
      }
      lastTimeRef.current = next;

      const msToNextSecond = 1000 - (Date.now() % 1000);
      timeoutId = setTimeout(tick, msToNextSecond + 10);
    };

    tick();

    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className="bg-blue-950 border border-blue-800 rounded-lg px-4 md:px-6 py-2 md:py-3">
      <div
        className="text-blue-100 font-black text-3xl md:text-4xl font-mono tracking-wider tabular-nums leading-none"
        style={{
          minWidth: "8ch",
          textAlign: "center",
          textShadow: "none",
          contain: "paint",
        }}
      >
        <span ref={hoursRef}>{initial.hours}</span>:
        <span ref={minutesRef}>{initial.minutes}</span>:
        <span ref={secondsRef}>{initial.seconds}</span>
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

export function SidebarPanel() {
  const [numerazo, setNumerazo] = useState("");
  const [laFija, setLaFija] = useState("");
  const [elEspecial, setElEspecial] = useState("");
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
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
      setLastUpdated(new Date().toISOString());

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

        if (
          data.updatedAt &&
          !data.syncError &&
          new Date(data.updatedAt).getTime() > 0
        ) {
          setLastUpdated(data.updatedAt);
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

      <div className="relative z-10 flex flex-col flex-1 w-full text-center min-h-0">
        <div className="flex flex-col items-center gap-1 mb-4">
          <h2
            className="text-xl md:text-2xl font-black text-emerald-50"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
          >
            Cabezas del día
          </h2>
          <DigitalClock />
        </div>

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
            <div className="mt-4 flex items-center justify-center gap-1.5">
              <p
                className="text-[10px] md:text-[11px] font-bold text-white tracking-wide"
                style={{ textShadow: "0 2px 4px rgba(0,0,0,0.85)" }}
              >
                Ultima actualización:{" "}
                {lastUpdated && new Date(lastUpdated).getTime() > 0
                  ? formatLastUpdated(lastUpdated)
                  : "Sin actualizar"}
              </p>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                aria-label="Actualizar cabezas del día"
                className="inline-flex items-center justify-center text-white/90 hover:text-white disabled:opacity-60 transition-colors"
                style={{ textShadow: "0 2px 4px rgba(0,0,0,0.85)" }}
              >
                <RefreshCw
                  className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
