import { shouldSendAlert } from "@/lib/alerts/dedupe";
import { sendNtfy } from "@/lib/alerts/ntfy";
import type { CabezasSyncErrorCode } from "@/lib/cabezas/types";

export type MonitoredApi = "quiniela" | "weather" | "cabezas";

const CABEZAS_ALERT_CODES: CabezasSyncErrorCode[] = [
  "instagram_fetch_failed",
  "unexpected_error",
];

export function shouldNotifyCabezasSync(code?: CabezasSyncErrorCode): boolean {
  if (!code) return true;
  if (code === "retry_wait" || code === "cached_hit") return false;
  return CABEZAS_ALERT_CODES.includes(code);
}

/** Fire-and-forget ntfy when an upstream/API path fails (deduped). */
export function notifyApiFailure(api: MonitoredApi, detail: string): void {
  const fingerprint = `${api}:${detail}`;
  if (!shouldSendAlert(fingerprint)) return;

  const message = `Quinielas — ${api} falló\n\n${detail}`;

  void sendNtfy(message, {
    title: `Quinielas — ${api}`,
    priority: "high",
    tags: ["warning", "quinielas", api],
  }).catch((error) => {
    console.warn("[Alerts] No se pudo enviar ntfy:", error);
  });
}
