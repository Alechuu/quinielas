const ARGENTINA_TZ = "America/Argentina/Buenos_Aires";
const ACTIVE_STORY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function getArgentinaDateKey(date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: ARGENTINA_TZ });
}

export function isUnixTimestampOnArgentinaDay(
  unixSeconds: number,
  dayKey = getArgentinaDateKey()
): boolean {
  const storyDay = new Date(unixSeconds * 1000).toLocaleDateString("en-CA", {
    timeZone: ARGENTINA_TZ,
  });
  return storyDay === dayKey;
}

export function isActiveInstagramStory(
  unixSeconds: number,
  now = Date.now()
): boolean {
  const ageMs = now - unixSeconds * 1000;
  return ageMs >= 0 && ageMs <= ACTIVE_STORY_WINDOW_MS;
}

