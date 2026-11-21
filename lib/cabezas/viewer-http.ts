import { Agent, fetch as undiciFetch } from "undici";

export const VIEWER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;
const DEFAULT_HEADERS_TIMEOUT_MS = 60_000;
const DEFAULT_BODY_TIMEOUT_MS = 120_000;

export class ViewerHttpClient {
  private readonly agent: Agent;

  constructor() {
    this.agent = new Agent({
      connect: { timeout: DEFAULT_CONNECT_TIMEOUT_MS },
      headersTimeout: DEFAULT_HEADERS_TIMEOUT_MS,
      bodyTimeout: DEFAULT_BODY_TIMEOUT_MS,
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 120_000,
      connections: 1,
      pipelining: 0,
    });
  }

  async fetch(
    url: string,
    init: RequestInit & { signal?: AbortSignal } = {}
  ): Promise<Response> {
    const response = await undiciFetch(url, {
      ...init,
      dispatcher: this.agent,
      headers: {
        "User-Agent": VIEWER_USER_AGENT,
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    return response as unknown as Response;
  }

  async close(): Promise<void> {
    await this.agent.close();
  }
}

export async function withViewerClient<T>(
  fn: (client: ViewerHttpClient) => Promise<T>
): Promise<T> {
  const client = new ViewerHttpClient();
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}