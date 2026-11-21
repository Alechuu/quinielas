import { NextResponse } from "next/server";
import { writeCabezas } from "@/lib/cabezas/storage";
import { getCabezasState } from "@/lib/cabezas/state";
import {
  notifyApiFailure,
  shouldNotifyCabezasSync,
} from "@/lib/alerts/notify-api-failure";
import {
  formatErrorMessage,
  serializeError,
} from "@/lib/cabezas/error-details";
import type { CabezasData, CabezasSyncError } from "@/lib/cabezas/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function fallbackSyncError(message: string): CabezasSyncError {
  return {
    message,
    code: "unexpected_error",
    step: "api/cabezas",
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shouldSync = url.searchParams.get("sync") === "1";

    if (shouldSync) {
      const { syncCabezasFromInstagram } = await import("@/lib/cabezas/sync");
      const force = url.searchParams.get("force") === "1";
      const result = await syncCabezasFromInstagram({ force });
      if (result.ok && result.data) {
        return NextResponse.json({
          ...result.data,
          syncOk: true,
          extracted: result.extracted,
        });
      }

      const syncError =
        result.error ?? fallbackSyncError("No se pudo sincronizar");
      if (shouldNotifyCabezasSync(syncError.code)) {
        const detail = [syncError.message, syncError.step]
          .filter(Boolean)
          .join(" · ");
        notifyApiFailure("cabezas", detail);
      }

      const fallback = await getCabezasState();
      return NextResponse.json({
        ...fallback,
        syncOk: false,
        syncError,
        extracted: result.extracted,
        cached: result.cached ?? false,
      });
    }

    const data = await getCabezasState();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: formatErrorMessage(error),
        errorCause: serializeError(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CabezasData>;
    const current = await getCabezasState();

    const data: CabezasData = {
      numerazo: body.numerazo ?? current.numerazo ?? "",
      laFija: body.laFija ?? current.laFija ?? "",
      elEspecial: body.elEspecial ?? current.elEspecial ?? "",
      fecha: body.fecha ?? current.fecha,
      source: "manual",
      updatedAt: new Date().toISOString(),
      storyImageUrl: current.storyImageUrl,
      storyTakenAt: current.storyTakenAt,
    };

    await writeCabezas(data);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        details: formatErrorMessage(error),
        errorCause: serializeError(error),
      },
      { status: 400 }
    );
  }
}