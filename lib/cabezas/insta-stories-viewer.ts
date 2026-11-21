import {
  VIEWER_USER_AGENT,
  ViewerHttpClient,
  withViewerClient,
} from "@/lib/cabezas/viewer-http";

const BASE_URL = "https://insta-stories-viewer.com";
const IMG_CDN = "https://cdn.insta-stories-viewer.com/img.php?url=";
const USERNAME = "agenciapuntoybanca";
const USER_AGENT = VIEWER_USER_AGENT;
const SEARCH_POLL_DEADLINE_MS = 45_000;
const SEARCH_SESSION_RETRIES = 3;
const SESSION_RETRY_DELAY_MS = 750;
const IMAGE_DOWNLOAD_RETRIES = 3;
const IMAGE_DOWNLOAD_TIMEOUT_MS = 45_000;

export interface ViewerStoryMedia {
  imageUrl: string;
  takenAt: number;
}

export interface ViewerStoryEdge {
  display_url?: string;
  taken_at?: number;
  is_video?: boolean | null;
}

interface ViewerSearchResult {
  data?: {
    status?: string;
    user?: {
      edges?: ViewerStoryEdge[];
      reels?: ViewerStoryEdge[];
    };
  };
}

export class InstaStoriesViewerError extends Error {
  step: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    step: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "InstaStoriesViewerError";
    this.step = step;
    this.details = details;
  }
}

function randomTag(): string {
  return Math.random().toString(36).slice(2, 10);
}

function isSessionExpiredStatus(status: number): boolean {
  return status === 400 || status === 410;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSearchResultPayload(packet: string): ViewerSearchResult | null {
  const marker = '["searchResult",';
  const start = packet.indexOf(marker);
  if (start === -1) return null;

  const jsonStart = packet.indexOf("{", start);
  if (jsonStart === -1) return null;

  let depth = 0;
  for (let i = jsonStart; i < packet.length; i++) {
    const char = packet[i];
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(packet.slice(jsonStart, i + 1)) as ViewerSearchResult;
      }
    }
  }

  return null;
}

async function fetchConnectToken(client: ViewerHttpClient): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await client.fetch(`${BASE_URL}/connect/`, {
      cache: "no-store",
    });

    if (response.status === 429 && attempt < 2) {
      await delay(2000 * (attempt + 1));
      continue;
    }

    if (!response.ok) {
      throw new InstaStoriesViewerError(
        `No se pudo conectar con insta-stories-viewer (${response.status})`,
        "fetchConnectToken",
        { status: response.status, attempt }
      );
    }

    const json = (await response.json()) as { token?: string };
    if (!json.token) {
      throw new InstaStoriesViewerError(
        "insta-stories-viewer no devolvió token",
        "fetchConnectToken"
      );
    }

    return json.token;
  }

  throw new InstaStoriesViewerError(
    "No se pudo conectar con insta-stories-viewer (429)",
    "fetchConnectToken",
    { status: 429 }
  );
}

async function socketGet(
  client: ViewerHttpClient,
  step: string,
  sid?: string,
  tag = randomTag()
): Promise<string> {
  const url = sid
    ? `${BASE_URL}/socket.io/?EIO=4&transport=polling&sid=${sid}&t=${tag}`
    : `${BASE_URL}/socket.io/?EIO=4&transport=polling&t=${tag}`;

  const response = await client.fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new InstaStoriesViewerError(
      `Socket polling falló (${response.status})`,
      step,
      {
        method: "GET",
        status: response.status,
        tag,
        sid: sid?.slice(0, 12),
      }
    );
  }

  return response.text();
}

async function socketPost(
  client: ViewerHttpClient,
  step: string,
  sid: string,
  body: string,
  tag = randomTag()
): Promise<void> {
  const response = await client.fetch(
    `${BASE_URL}/socket.io/?EIO=4&transport=polling&sid=${sid}&t=${tag}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body,
    }
  );

  if (!response.ok) {
    throw new InstaStoriesViewerError(
      `Socket post falló (${response.status})`,
      step,
      {
        method: "POST",
        status: response.status,
        tag,
        sid: sid.slice(0, 12),
        bodyLength: body.length,
      }
    );
  }

  // Drain the response so the polling transport keeps the session sticky.
  await response.text();
}

function extractSocketSid(handshake: string): string {
  const match = handshake.match(/"sid":"([^"]+)"/);
  if (!match?.[1]) {
    throw new InstaStoriesViewerError(
      "No se pudo abrir sesión socket con insta-stories-viewer",
      "socketHandshake"
    );
  }
  return match[1];
}

async function respondToEngineIoPackets(
  client: ViewerHttpClient,
  sid: string,
  packet: string
): Promise<void> {
  for (const part of packet.split("\x1e").filter(Boolean)) {
    if (part === "2" || part.startsWith("2")) {
      await socketPost(client, "socketPong", sid, "3", `pong${Date.now()}`);
    }
  }
}

function isSocketConnected(packet: string): boolean {
  return packet.includes('40{"sid"') || packet.startsWith("40{");
}

async function waitForSocketConnect(
  client: ViewerHttpClient,
  sid: string
): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) {
      await delay(250);
    }

    try {
      const packet = await socketGet(
        client,
        "socketConnectAck",
        sid,
        `cack${attempt}`
      );

      if (isSocketConnected(packet)) {
        return;
      }

      await respondToEngineIoPackets(client, sid, packet);
    } catch (error) {
      const status =
        error instanceof InstaStoriesViewerError &&
        typeof error.details?.status === "number"
          ? error.details.status
          : null;

      if (status === 400 || status === 410) {
        continue;
      }

      throw error;
    }
  }
}

async function searchStories(
  client: ViewerHttpClient,
  token: string
): Promise<ViewerStoryEdge[]> {
  const handshake = await socketGet(client, "socketHandshake");
  const sid = extractSocketSid(handshake);

  await socketPost(client, "socketConnect", sid, "40", "connect");
  await waitForSocketConnect(client, sid);

  const searchPayload = `42["search",${JSON.stringify({
    username: USERNAME,
    date: Date.now(),
    token,
  })}]`;
  await socketPost(client, "socketSearch", sid, searchPayload, "search");

  const startedAt = Date.now();
  let pollAttempt = 0;

  while (Date.now() - startedAt < SEARCH_POLL_DEADLINE_MS) {
    if (pollAttempt > 0) {
      await delay(700);
    }

    const packet = await socketGet(
      client,
      "socketPoll",
      sid,
      `wait${pollAttempt}`
    );

    pollAttempt++;

    const result = parseSearchResultPayload(packet);
    if (result) {
      if (result.data?.status !== "success") {
        throw new InstaStoriesViewerError(
          "insta-stories-viewer no pudo leer las historias",
          "socketSearchResult",
          { status: result.data?.status }
        );
      }

      const user = result.data.user;
      return user?.reels?.length ? user.reels : (user?.edges ?? []);
    }

    await respondToEngineIoPackets(client, sid, packet);
  }

  throw new InstaStoriesViewerError(
    "Timeout esperando historias de insta-stories-viewer",
    "socketPoll",
    {
      pollAttempts: pollAttempt,
      deadlineMs: SEARCH_POLL_DEADLINE_MS,
    }
  );
}

export function buildViewerImageUrl(displayUrl: string): string {
  return `${IMG_CDN}${encodeURIComponent(displayUrl)}`;
}

export async function fetchViewerStories(
  client: ViewerHttpClient
): Promise<ViewerStoryEdge[]> {
  let lastError: unknown;

  for (let session = 0; session < SEARCH_SESSION_RETRIES; session++) {
    try {
      const token = await fetchConnectToken(client);
      return await searchStories(client, token);
    } catch (error) {
      lastError = error;

      const status =
        error instanceof InstaStoriesViewerError &&
        typeof error.details?.status === "number"
          ? error.details.status
          : null;

      if (
        status &&
        isSessionExpiredStatus(status) &&
        session < SEARCH_SESSION_RETRIES - 1
      ) {
        await delay(SESSION_RETRY_DELAY_MS);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export async function downloadViewerImage(
  client: ViewerHttpClient,
  imageUrl: string
): Promise<Buffer> {
  let lastError: unknown;

  for (let attempt = 0; attempt < IMAGE_DOWNLOAD_RETRIES; attempt++) {
    try {
      const response = await client.fetch(imageUrl, {
        cache: "no-store",
        signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
        headers: {
          Referer: `${BASE_URL}/`,
        },
      });

      if (!response.ok) {
        throw new InstaStoriesViewerError(
          "No se pudo descargar la imagen del story",
          "downloadViewerImage",
          { status: response.status, attempt }
        );
      }

      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < IMAGE_DOWNLOAD_RETRIES - 1) {
        await delay(500 * (attempt + 1));
      }
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : "Error desconocido";
  throw new InstaStoriesViewerError(
    message,
    "downloadViewerImage",
    {
      urlLength: imageUrl.length,
      attempts: IMAGE_DOWNLOAD_RETRIES,
    }
  );
}

export async function withInstagramViewer<T>(
  fn: (client: ViewerHttpClient) => Promise<T>
): Promise<T> {
  return withViewerClient(fn);
}