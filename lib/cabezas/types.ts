export interface CabezasData {
  numerazo: string;
  laFija: string;
  elEspecial: string;
  fecha?: string;
  source: "instagram" | "manual";
  updatedAt: string;
  storyImageUrl?: string;
  storyTakenAt?: number;
  syncDayKey?: string;
  foundForDay?: boolean;
  lastSyncAttemptAt?: string;
}

export type CabezasSyncErrorCode =
  | "cached_hit"
  | "retry_wait"
  | "story_not_found"
  | "instagram_fetch_failed"
  | "unexpected_error";

export interface CabezasStoryAttempt {
  takenAt: number;
  valid: boolean;
  extracted: {
    numerazo: string | null;
    laFija: string | null;
    elEspecial: string | null;
  } | null;
  error?: string;
}

export interface CabezasSyncError {
  message: string;
  code: CabezasSyncErrorCode;
  step: string;
  cached?: boolean;
  durationMs?: number;
  details?: {
    force?: boolean;
    syncDayKey?: string;
    foundForDay?: boolean;
    lastSyncAttemptAt?: string;
    totalStories?: number;
    activeStories?: number;
    attemptedStories?: number;
    storyAttempts?: CabezasStoryAttempt[];
    errorName?: string;
    stack?: string;
    [key: string]: unknown;
  };
}

export interface CabezasSyncResult {
  ok: boolean;
  data?: CabezasData;
  error?: CabezasSyncError;
  cached?: boolean;
  extracted?: {
    numerazo: string | null;
    laFija: string | null;
    elEspecial: string | null;
  };
}
