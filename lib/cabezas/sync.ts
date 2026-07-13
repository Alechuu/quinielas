import {
  extractCabezasFromImage,
  isValidExtraction,
} from "@/lib/cabezas/extract-from-image";
import {
  downloadStoryImage,
  fetchLatestStoryImage,
} from "@/lib/cabezas/instagram";
import { readCabezas, writeCabezas } from "@/lib/cabezas/storage";
import type { CabezasData, CabezasSyncResult } from "@/lib/cabezas/types";

export async function syncCabezasFromInstagram(): Promise<CabezasSyncResult> {
  try {
    const story = await fetchLatestStoryImage();
    if (!story) {
      return {
        ok: false,
        error:
          "No se encontró el story de cabezas de hoy entre las historias activas.",
      };
    }

    const imageBuffer = await downloadStoryImage(story.imageUrl);
    const extracted = await extractCabezasFromImage(imageBuffer);

    if (!isValidExtraction(extracted)) {
      return {
        ok: false,
        error: "No se pudieron extraer los tres números del story",
        extracted,
      };
    }

    const data: CabezasData = {
      numerazo: extracted.numerazo,
      laFija: extracted.laFija,
      elEspecial: extracted.elEspecial,
      source: "instagram",
      updatedAt: new Date().toISOString(),
      storyImageUrl: story.imageUrl,
      storyTakenAt: story.takenAt,
    };

    await writeCabezas(data);

    return {
      ok: true,
      data,
      extracted,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al sincronizar desde Instagram";
    return {
      ok: false,
      error: message,
    };
  }
}

export async function getCabezasState(): Promise<CabezasData> {
  return readCabezas();
}
