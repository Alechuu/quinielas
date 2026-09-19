const DEDUPE_MS = 6 * 60 * 60 * 1000;

let lastFingerprint: string | null = null;
let lastSentAt = 0;

/** Avoid repeating the same failure alert on every cron tick. */
export function shouldSendAlert(fingerprint: string): boolean {
  const now = Date.now();
  if (fingerprint === lastFingerprint && now - lastSentAt < DEDUPE_MS) {
    return false;
  }
  lastFingerprint = fingerprint;
  lastSentAt = now;
  return true;
}
