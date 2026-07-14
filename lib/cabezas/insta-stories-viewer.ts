const BASE_URL = "https://insta-stories-viewer.com";
const IMG_CDN = "https://cdn.insta-stories-viewer.com/img.php?url=";
const USERNAME = "agenciapuntoybanca";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
const SEARCH_POLL_DEADLINE_MS = 45_000;
const SEARCH_SESSION_RETRIES = 3;
const SESSION_RETRY_DELAY_MS = 750;

export interface ViewerStoryMedia {
  imageUrl: string;
  takenAt: number;
}

interface ViewerStoryEdge {
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

async function fetchConnectToken(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${BASE_URL}/connect/`, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT },
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
  step: string,
  sid?: string,
  tag = randomTag()
): Promise<string> {
  const url = sid
    ? `${BASE_URL}/socket.io/?EIO=4&transport=polling&sid=${sid}&t=${tag}`
    : `${BASE_URL}/socket.io/?EIO=4&transport=polling&t=${tag}`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT },
  });

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
  step: string,
  sid: string,
  body: string,
  tag = randomTag()
): Promise<void> {
  const response = await fetch(
    `${BASE_URL}/socket.io/?EIO=4&transport=polling&sid=${sid}&t=${tag}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "User-Agent": USER_AGENT,
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

async function searchStories(token: string): Promise<ViewerStoryEdge[]> {
  const handshake = await socketGet("socketHandshake");
  const sid = extractSocketSid(handshake);

  await socketPost("socketConnect", sid, "40", "connect");
  await socketGet("socketAck", sid, "ack");

  const searchPayload = `42["search",${JSON.stringify({
    username: USERNAME,
    date: Date.now(),
    token,
  })}]`;
  await socketPost("socketSearch", sid, searchPayload, "search");

  const startedAt = Date.now();
  let pollAttempt = 0;

  while (Date.now() - startedAt < SEARCH_POLL_DEADLINE_MS) {
    if (pollAttempt > 0) {
      await delay(700);
    }

    const packet = await socketGet(
      "socketPoll",
      sid,
      `wait${pollAttempt}`
    );

    pollAttempt++;

    const result = parseSearchResultPayload(packet);
    if (!result) continue;

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

export async function fetchViewerStories(): Promise<ViewerStoryEdge[]> {
  let lastError: unknown;

  for (let session = 0; session < SEARCH_SESSION_RETRIES; session++) {
    try {
      const token = await fetchConnectToken();
      return await searchStories(token);
    } catch (error) {
      lastError = error;

      const status =
        error instanceof InstaStoriesViewerError &&
        typeof error.details?.status === "number"
          ? error.details.status
          : null;

      if (status && isSessionExpiredStatus(status) && session < SEARCH_SESSION_RETRIES - 1) {
        await delay(SESSION_RETRY_DELAY_MS);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export async function downloadViewerImage(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl, {
    cache: "no-store",
    headers: {
      "User-Agent": USER_AGENT,
      Referer: `${BASE_URL}/`,
    },
  });

  if (!response.ok) {
    throw new InstaStoriesViewerError(
      "No se pudo descargar la imagen del story",
      "downloadViewerImage",
      { status: response.status }
    );
  }

  return Buffer.from(await response.arrayBuffer());
}
