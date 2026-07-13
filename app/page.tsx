"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { QuinielaTable } from "@/components/quiniela-table";
import { SidebarPanel } from "@/components/sidebar-panel";
import { CierresSection } from "@/components/cierres-section";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuinielaData {
  fecha: string;
  fechaAyer?: string;
  consultado: string;
  sorteos: {
    [provincia: string]: {
      [horario: string]: string | null;
    };
  };
  nocturnasAyer?: {
    [provincia: string]: string | null;
  };
}

// URL de la API local de Next.js
const API_URL = "/api/quiniela";

// Horarios de sorteo (hora Argentina)
const HORARIOS_SORTEO = {
  Previa: 10.25,
  Primera: 12.17,
  Matutina: 15.17,
  Vespertina: 18.17,
  Nocturna: 21.17,
};

// Intervalo de actualizacion automatica (1 minuto)
const AUTO_REFRESH_INTERVAL = 1 * 60 * 1000;

function getArgentinaTime(): Date {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    })
  );
}

function getCurrentHourDecimal(simulatedTime: string | null): number {
  if (simulatedTime) {
    const match = simulatedTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (match) {
      return Number(match[1]) + Number(match[2]) / 60;
    }
  }

  const now = getArgentinaTime();
  return now.getHours() + now.getMinutes() / 60;
}

function QuinielaContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDebug = searchParams.get("debug") !== null;
  const simulatedTimeParam = searchParams.get("simTime");
  const simulatedTime =
    simulatedTimeParam && /^([01]\d|2[0-3]):([0-5]\d)$/.test(simulatedTimeParam)
      ? simulatedTimeParam
      : null;

  const [data, setData] = useState<QuinielaData | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quinielaRefreshKey, setQuinielaRefreshKey] = useState(0);
  const hasLoadedOnceRef = useRef(false);
  const [simTimeInput, setSimTimeInput] = useState(simulatedTime ?? "");

  useEffect(() => {
    setSimTimeInput(simulatedTime ?? "");
  }, [simulatedTime]);

  const setDebugQueryTime = useCallback(
    (time: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("debug", "true");
      if (time) {
        params.set("simTime", time);
      } else {
        params.delete("simTime");
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  // Determinar que horarios mostrar segun la hora actual
  const getVisibleHorarios = useCallback((): string[] => {
    const currentHour = getCurrentHourDecimal(simulatedTime);
    const visible: string[] = [];

    // Siempre mostrar Nocturna
    visible.push("Nocturna");

    if (currentHour >= 8) {
      if (currentHour >= HORARIOS_SORTEO.Previa) visible.push("Previa");
      if (currentHour >= HORARIOS_SORTEO.Primera) visible.push("Primera");
      if (currentHour >= HORARIOS_SORTEO.Matutina) visible.push("Matutina");
      if (currentHour >= HORARIOS_SORTEO.Vespertina) visible.push("Vespertina");
    }

    return visible;
  }, [simulatedTime]);

  const fetchData = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) {
      setInitialLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (isDebug) params.set("debug", "true");
      if (isDebug && simulatedTime) params.set("simTime", simulatedTime);
      const url = params.toString() ? `${API_URL}?${params.toString()}` : API_URL;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Error al conectar con la API");
      }

      const jsonData: QuinielaData = await response.json();
      setData(jsonData);
      setQuinielaRefreshKey((key) => key + 1);
      hasLoadedOnceRef.current = true;
    } catch {
      setError("Error al conectar con la API");
    } finally {
      if (isFirstLoad) {
        setInitialLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [isDebug, simulatedTime]);

  // Carga inicial
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchData]);

  // Obtener nocturnas de ayer desde la API
  const nocturnasAyer = data?.nocturnasAyer || {};

  return (
    <main className="h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 p-2 overflow-hidden">
      <div className="w-full p-4 h-full flex flex-col">
        {/* Header */}
        {isDebug && (
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-end gap-2 mb-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor="sim-time"
                className="text-xs text-emerald-200/90 font-semibold"
              >
                Hora simulada
              </label>
              <input
                id="sim-time"
                type="time"
                value={simTimeInput}
                onChange={(e) => setSimTimeInput(e.target.value)}
                className="bg-slate-900/80 border border-emerald-500/40 text-emerald-100 text-sm rounded-md px-2 py-1"
              />
              <Button
                onClick={() => {
                  const value = simTimeInput.trim();
                  if (!value) {
                    setDebugQueryTime(null);
                    return;
                  }
                  if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(value)) {
                    setDebugQueryTime(value);
                  }
                }}
                disabled={initialLoading || refreshing}
                className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-1 px-3 rounded-md"
              >
                Aplicar
              </Button>
              <Button
                onClick={() => setDebugQueryTime(null)}
                disabled={initialLoading || refreshing}
                className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-1 px-3 rounded-md"
              >
                Hora real
              </Button>
            </div>
            <Button
              onClick={fetchData}
              disabled={initialLoading || refreshing}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl transition-all duration-200 shadow-lg"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Actualizar
            </Button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border-2 border-red-500 text-red-200 rounded-xl text-sm font-semibold backdrop-blur">
            {error}
          </div>
        )}

        {/* Main content */}
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          {/* Tabla de quiniela */}
          <div className="flex-1 bg-slate-800/80 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden border border-emerald-500/30 flex flex-col">
            <QuinielaTable
              data={data}
              initialLoading={initialLoading}
              refreshing={refreshing}
              nocturnasAyer={nocturnasAyer}
              visibleHorarios={getVisibleHorarios()}
            />
            <CierresSection />
          </div>

          {/* Panel lateral */}
          <div className="w-full lg:w-72 xl:w-80">
            <SidebarPanel quinielaRefreshKey={quinielaRefreshKey} />
          </div>
        </div>
      </div>
    </main>
  );
}

export default function QuinielaPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-slate-900" />}>
      <QuinielaContent />
    </Suspense>
  );
}
