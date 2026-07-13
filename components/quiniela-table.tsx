"use client";

import { useEffect, useRef, useState } from "react";

interface QuinielaData {
  fecha: string;
  consultado: string;
  sorteos: {
    [provincia: string]: {
      [horario: string]: string | null;
    };
  };
}

interface QuinielaTableProps {
  data: QuinielaData | null;
  initialLoading: boolean;
  refreshing: boolean;
  nocturnasAyer: { [provincia: string]: string | null };
  visibleHorarios: string[];
}

const horarios = [
  { key: "Previa", label: "PREVIA", time: "10.15 HS" },
  { key: "Primera", label: "EL PRIMERO", time: "12 HS" },
  { key: "Matutina", label: "MATUTINA", time: "15 HS" },
  { key: "Vespertina", label: "VESPERTINA", time: "18 HS" },
  {
    key: "Nocturna",
    label: "NOCTURNA",
    time: "ANOCHE 21 HS",
    isNocturna: true,
  },
];

const provincias = [
  { key: "Provincia", label: "Provincia" },
  { key: "Ciudad", label: "Ciudad" },
  { key: "Cordoba", label: "Córdoba" },
  { key: "Santa Fe", label: "Santa Fé" },
  { key: "Entre Rios", label: "Entre Ríos" },
  { key: "Montevideo", label: "Montevideo" },
];

function QuinielaNumero({
  value,
  showPlaceholder,
}: {
  value: string;
  showPlaceholder: boolean;
}) {
  const prevValueRef = useRef<string | null>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const prev = prevValueRef.current;

    if (prev !== null && value !== prev && value !== "----") {
      setAnimate(true);
      const timeoutId = setTimeout(() => setAnimate(false), 600);
      prevValueRef.current = value;
      return () => clearTimeout(timeoutId);
    }

    prevValueRef.current = value;
  }, [value]);

  const display = showPlaceholder ? "----" : value;

  return (
    <div
      className={`text-5xl font-black drop-shadow-lg ${
        showPlaceholder ? "animate-pulse text-slate-400" : "text-white"
      } ${animate ? "animate-numero-change" : ""}`}
    >
      {display}
    </div>
  );
}

export function QuinielaTable({
  data,
  initialLoading,
  refreshing,
  nocturnasAyer,
  visibleHorarios,
}: QuinielaTableProps) {
  const getNumero = (provincia: string, horario: string): string => {
    if (horario === "Nocturna") {
      const fromSorteos = data?.sorteos?.[provincia]?.Nocturna;
      if (fromSorteos) return fromSorteos;
      if (nocturnasAyer[provincia]) {
        return nocturnasAyer[provincia] || "----";
      }
      return "----";
    }

    if (!visibleHorarios.includes(horario)) {
      return "----";
    }

    if (!data?.sorteos?.[provincia]?.[horario]) return "----";
    return data.sorteos[provincia][horario] || "----";
  };

  const shouldShowCell = (provincia: string, horario: string): boolean => {
    if (provincia === "Montevideo") {
      return horario === "Matutina" || horario === "Nocturna";
    }
    return true;
  };

  const getCellColor = (
    provincia: string,
    horario: string,
    isEmpty: boolean
  ): string => {
    if (isEmpty) {
      return "bg-slate-700/40";
    }

    if (provincia === "Montevideo") {
      return "bg-emerald-700/90";
    }

    if (horario === "Nocturna") {
      return "bg-cyan-700/80";
    }

    return "bg-[#7fb11a]/90";
  };

  return (
    <div className="w-full flex-1 grid grid-rows-[auto_1fr]">
      <div className="grid grid-cols-5">
        {horarios.map((horario, index) => (
          <div
            key={horario.key}
            className={`px-2 py-2 text-white font-black text-xs md:text-sm border-2 border-slate-600 text-center ${
              index === 4 ? "bg-blue-700" : "bg-emerald-600"
            } ${index === 0 ? "rounded-tl-2xl" : ""} ${
              index === 4 ? "rounded-tr-2xl" : ""
            }`}
          >
            <div className="font-black text-base md:text-2xl">
              {horario.label}
            </div>
            <div className="text-lg font-bold text-blue-100">
              {horario.time}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-rows-6">
        {provincias.map((provincia) => (
          <div key={provincia.key} className="grid grid-cols-5">
            {horarios.map((horario) => {
              const showCell = shouldShowCell(provincia.key, horario.key);

              if (!showCell) {
                return (
                  <div
                    key={horario.key}
                    className="border-2 border-slate-600 bg-slate-700/20"
                  />
                );
              }

              const numero = getNumero(provincia.key, horario.key);
              const isEmpty = numero === "----";
              const cellColor = getCellColor(
                provincia.key,
                horario.key,
                isEmpty
              );

              return (
                <QuinielaCell
                  key={horario.key}
                  provinciaLabel={provincia.label}
                  numero={numero}
                  cellColor={cellColor}
                  showPlaceholder={initialLoading}
                  refreshing={refreshing}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function QuinielaCell({
  provinciaLabel,
  numero,
  cellColor,
  showPlaceholder,
  refreshing,
}: {
  provinciaLabel: string;
  numero: string;
  cellColor: string;
  showPlaceholder: boolean;
  refreshing: boolean;
}) {
  const prevNumeroRef = useRef<string | null>(null);
  const [cellAnimate, setCellAnimate] = useState(false);

  useEffect(() => {
    const prev = prevNumeroRef.current;

    if (prev !== null && numero !== prev && numero !== "----") {
      setCellAnimate(true);
      const timeoutId = setTimeout(() => setCellAnimate(false), 700);
      prevNumeroRef.current = numero;
      return () => clearTimeout(timeoutId);
    }

    prevNumeroRef.current = numero;
  }, [numero]);

  return (
    <div
      className={`border-2 border-slate-600 px-2 py-2 ${cellColor} hover:opacity-90 transition-opacity flex flex-col items-center justify-center text-center ${
        cellAnimate ? "animate-cell-change" : ""
      } ${refreshing ? "opacity-95" : ""}`}
    >
      <div className="text-base md:text-2xl font-bold text-white mb-1 drop-shadow">
        {provinciaLabel}
      </div>
      <QuinielaNumero value={numero} showPlaceholder={showPlaceholder} />
    </div>
  );
}
