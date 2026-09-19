const DEFAULT_SERVER = "https://ntfy.sh";
const DEFAULT_TOPIC = "quinielas-alert";

export interface NtfyOptions {
  title?: string;
  priority?: "min" | "low" | "default" | "high" | "max" | "urgent";
  tags?: string[];
}

function ntfyBaseUrl(): string {
  return (process.env.NTFY_SERVER ?? DEFAULT_SERVER).replace(/\/$/, "");
}

function ntfyTopic(): string {
  return process.env.NTFY_TOPIC ?? DEFAULT_TOPIC;
}

export async function sendNtfy(
  message: string,
  options?: NtfyOptions
): Promise<{ ok: boolean; status: number }> {
  const url = `${ntfyBaseUrl()}/${encodeURIComponent(ntfyTopic())}`;
  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
  };

  if (options?.title) headers.Title = options.title;
  if (options?.priority) headers.Priority = options.priority;
  if (options?.tags?.length) headers.Tags = options.tags.join(",");

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: message,
    cache: "no-store",
  });

  return { ok: response.ok, status: response.status };
}
