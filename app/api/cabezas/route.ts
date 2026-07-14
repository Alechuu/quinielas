import { NextResponse } from "next/server";
import { getCabezasState, syncCabezasFromInstagram } from "@/lib/cabezas/sync";
import { writeCabezas } from "@/lib/cabezas/storage";
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
  const url = new URL(request.url);
  const shouldSync = url.searchParams.get("sync") === "1";

  if (shouldSync) {
    const force = url.searchParams.get("force") === "1";
    const result = await syncCabezasFromInstagram({ force });
    if (result.ok && result.data) {
      return NextResponse.json({
        ...result.data,
        syncOk: true,
        extracted: result.extracted,
      });
    }

    const fallback = await getCabezasState();
    return NextResponse.json({
      ...fallback,
      syncOk: false,
      syncError: result.error ?? fallbackSyncError("No se pudo sincronizar"),
      extracted: result.extracted,
      cached: result.cached ?? false,
    });
  }

  const data = await getCabezasState();
  return NextResponse.json(data);
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
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
}
