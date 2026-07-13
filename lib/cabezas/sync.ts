import { getArgentinaDateKey, isActiveInstagramStory } from "@/lib/cabezas/date";
import {
  extractCabezasFromImage,
  isValidExtraction,
  type ValidatedCabezas,
} from "@/lib/cabezas/extract-from-image";
import {
  buildViewerImageUrl,
  downloadViewerImage,
  fetchViewerStories,
} from "@/lib/cabezas/insta-stories-viewer";
import { readCabezas, writeCabezas } from "@/lib/cabezas/storage";
import type { CabezasData, CabezasSyncResult } from "@/lib/cabezas/types";

const RETRY_INTERVAL_MS = 60 * 60 * 1000;

function hasValidNumbers(data: CabezasData): boolean {
  return Boolean(
    data.numerazo &&
      /^\d{4}$/.test(data.numerazo) &&
      data.laFija &&
      /^\d{3}$/.test(data.laFija) &&
      data.elEspecial &&
      /^\d{2}$/.test(data.elEspecial)
  );
}

function shouldSkipRemoteSync(state: CabezasData, force: boolean): boolean {
  if (force) return false;

  const today = getArgentinaDateKey();
  const now = Date.now();

  if (
    state.syncDayKey === today &&
    state.foundForDay &&
    hasValidNumbers(state)
  ) {
    return true;
  }

  if (
    state.syncDayKey === today &&
    state.lastSyncAttemptAt &&
    now - new Date(state.lastSyncAttemptAt).getTime() < RETRY_INTERVAL_MS
  ) {
    return true;
  }

  return false;
}

async function findActiveCabezasStory(): Promise<{
  imageUrl: string;
  takenAt: number;
  extracted: ValidatedCabezas;
} | null> {
  const edges = await fetchViewerStories();

  const activeStories = edges
    .filter(
      (edge) =>
        edge.display_url &&
        !edge.is_video &&
        typeof edge.taken_at === "number" &&
        isActiveInstagramStory(edge.taken_at)
    )
    .map((edge) => ({
      imageUrl: buildViewerImageUrl(edge.display_url!),
      takenAt: edge.taken_at!,
    }))
    .sort((a, b) => b.takenAt - a.takenAt);

  for (const story of activeStories) {
    try {
      const imageBuffer = await downloadViewerImage(story.imageUrl);
      const extracted = await extractCabezasFromImage(imageBuffer);
      if (isValidExtraction(extracted)) {
        return { ...story, extracted };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function syncCabezasFromInstagram(options?: {
  force?: boolean;
}): Promise<CabezasSyncResult> {
  const force = options?.force ?? false;
  const today = getArgentinaDateKey();
  const current = await readCabezas();

  if (shouldSkipRemoteSync(current, force)) {
    if (
      current.syncDayKey === today &&
      current.foundForDay &&
      hasValidNumbers(current)
    ) {
      return { ok: true, data: current, cached: true };
    }

    return {
      ok: false,
      data: current,
      cached: true,
      error:
        current.foundForDay === false
          ? "Todavía no apareció el story de cabezas de hoy. Reintentá en unos minutos."
          : "Esperando el próximo intento automático de sincronización.",
    };
  }

  const attemptAt = new Date().toISOString();

  try {
    const story = await findActiveCabezasStory();
    if (!story) {
      const pending: CabezasData = {
        ...current,
        syncDayKey: today,
        foundForDay: false,
        lastSyncAttemptAt: attemptAt,
        updatedAt: current.updatedAt,
      };
      await writeCabezas(pending);

      return {
        ok: false,
        data: pending,
        error:
          "No se encontró el story de cabezas de hoy entre las historias activas.",
      };
    }

    const { extracted } = story;

    const data: CabezasData = {
      numerazo: extracted.numerazo,
      laFija: extracted.laFija,
      elEspecial: extracted.elEspecial,
      fecha: today,
      source: "instagram",
      updatedAt: new Date().toISOString(),
      storyImageUrl: story.imageUrl,
      storyTakenAt: story.takenAt,
      syncDayKey: today,
      foundForDay: true,
      lastSyncAttemptAt: attemptAt,
    };

    await writeCabezas(data);

    return {
      ok: true,
      data,
      extracted,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error al sincronizar desde Instagram";

    const failed: CabezasData = {
      ...current,
      syncDayKey: today,
      foundForDay: current.foundForDay ?? false,
      lastSyncAttemptAt: attemptAt,
    };
    await writeCabezas(failed);

    return {
      ok: false,
      error: message,
      data: failed,
    };
  }
}

export async function getCabezasState(): Promise<CabezasData> {
  return readCabezas();
}
