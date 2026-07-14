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
  InstaStoriesViewerError,
} from "@/lib/cabezas/insta-stories-viewer";
import { readCabezas, writeCabezas } from "@/lib/cabezas/storage";
import type {
  CabezasData,
  CabezasStoryAttempt,
  CabezasSyncError,
  CabezasSyncResult,
} from "@/lib/cabezas/types";

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

function buildSyncError(
  code: CabezasSyncError["code"],
  step: string,
  message: string,
  options?: {
    cached?: boolean;
    durationMs?: number;
    details?: CabezasSyncError["details"];
    cause?: unknown;
  }
): CabezasSyncError {
  const details = { ...options?.details };

  if (options?.cause instanceof Error) {
    details.errorName = options.cause.name;
    details.stack = options.cause.stack;
  }

  if (options?.cause instanceof InstaStoriesViewerError) {
    details.viewerStep = options.cause.step;
    details.viewerDetails = options.cause.details;
  }

  return {
    message,
    code,
    step,
    cached: options?.cached,
    durationMs: options?.durationMs,
    details: Object.keys(details).length > 0 ? details : undefined,
  };
}

// Cache policy:
// - Fetch from Instagram at most once per Argentina calendar day after a successful sync.
// - Failed attempts are retried at most once per hour.
// - A new Argentina day clears the daily cache and allows a fresh fetch.
// - On Vercel, server state is in-memory only; the client keeps the daily cache marker.
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

async function findActiveCabezasStory(): Promise<
  | {
      ok: true;
      story: {
        imageUrl: string;
        takenAt: number;
        extracted: ValidatedCabezas;
      };
      diagnostics: {
        totalStories: number;
        activeStories: number;
        attemptedStories: number;
        storyAttempts: CabezasStoryAttempt[];
      };
    }
  | {
      ok: false;
      diagnostics: {
        totalStories: number;
        activeStories: number;
        attemptedStories: number;
        storyAttempts: CabezasStoryAttempt[];
      };
      cause?: unknown;
    }
> {
  const storyAttempts: CabezasStoryAttempt[] = [];

  try {
    const edges = await fetchViewerStories();
    const totalStories = edges.length;

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
        const valid = isValidExtraction(extracted);

        storyAttempts.push({
          takenAt: story.takenAt,
          valid,
          extracted,
        });

        if (valid) {
          return {
            ok: true,
            story: { ...story, extracted },
            diagnostics: {
              totalStories,
              activeStories: activeStories.length,
              attemptedStories: storyAttempts.length,
              storyAttempts,
            },
          };
        }
      } catch (error) {
        storyAttempts.push({
          takenAt: story.takenAt,
          valid: false,
          extracted: null,
          error: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    return {
      ok: false,
      diagnostics: {
        totalStories,
        activeStories: activeStories.length,
        attemptedStories: storyAttempts.length,
        storyAttempts,
      },
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: {
        totalStories: 0,
        activeStories: 0,
        attemptedStories: storyAttempts.length,
        storyAttempts,
      },
      cause: error,
    };
  }
}

export async function syncCabezasFromInstagram(options?: {
  force?: boolean;
}): Promise<CabezasSyncResult> {
  const startedAt = Date.now();
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
      error: buildSyncError(
        "retry_wait",
        "shouldSkipRemoteSync",
        current.foundForDay === false
          ? "Todavía no apareció el story de cabezas de hoy. Reintentá en unos minutos."
          : "Esperando el próximo intento automático de sincronización.",
        {
          cached: true,
          durationMs: Date.now() - startedAt,
          details: {
            force,
            syncDayKey: current.syncDayKey,
            foundForDay: current.foundForDay,
            lastSyncAttemptAt: current.lastSyncAttemptAt,
            retryIntervalMs: RETRY_INTERVAL_MS,
          },
        }
      ),
    };
  }

  const attemptAt = new Date().toISOString();

  try {
    const result = await findActiveCabezasStory();

    if (!result.ok) {
      const pending: CabezasData = {
        ...current,
        syncDayKey: today,
        foundForDay: false,
        lastSyncAttemptAt: attemptAt,
        updatedAt: current.updatedAt,
      };
      await writeCabezas(pending);

      if (result.cause) {
        const message =
          result.cause instanceof Error
            ? result.cause.message
            : "Error al sincronizar desde Instagram";

        return {
          ok: false,
          data: pending,
          error: buildSyncError(
            "instagram_fetch_failed",
            result.cause instanceof InstaStoriesViewerError
              ? result.cause.step
              : "fetchViewerStories",
            message,
            {
              durationMs: Date.now() - startedAt,
              cause: result.cause,
              details: {
                force,
                syncDayKey: today,
                ...result.diagnostics,
              },
            }
          ),
        };
      }

      return {
        ok: false,
        data: pending,
        error: buildSyncError(
          "story_not_found",
          "findActiveCabezasStory",
          "No se encontró el story de cabezas de hoy entre las historias activas.",
          {
            durationMs: Date.now() - startedAt,
            details: {
              force,
              syncDayKey: today,
              ...result.diagnostics,
            },
          }
        ),
      };
    }

    const { story } = result;
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
      error: buildSyncError(
        "unexpected_error",
        "syncCabezasFromInstagram",
        message,
        {
          durationMs: Date.now() - startedAt,
          cause: error,
          details: {
            force,
            syncDayKey: today,
            foundForDay: failed.foundForDay,
            lastSyncAttemptAt: attemptAt,
          },
        }
      ),
      data: failed,
    };
  }
}

export async function getCabezasState(): Promise<CabezasData> {
  return readCabezas();
}
