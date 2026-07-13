const BASE_URL = "https://insta-stories-viewer.com";
const IMG_CDN = "https://cdn.insta-stories-viewer.com/img.php?url=";
const USERNAME = "agenciapuntoybanca";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

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

function randomTag(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function fetchConnectToken(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${BASE_URL}/connect/`, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT },
    });

    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `No se pudo conectar con insta-stories-viewer (${response.status})`
      );
    }

    const json = (await response.json()) as { token?: string };
    if (!json.token) {
      throw new Error("insta-stories-viewer no devolvió token");
    }

    return json.token;
  }

  throw new Error("No se pudo conectar con insta-stories-viewer (429)");
}

async function socketGet(sid?: string, tag = randomTag()): Promise<string> {
  const url = sid
    ? `${BASE_URL}/socket.io/?EIO=4&transport=polling&sid=${sid}&t=${tag}`
    : `${BASE_URL}/socket.io/?EIO=4&transport=polling&t=${tag}`;

  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Socket polling falló (${response.status})`);
  }

  return response.text();
}

async function socketPost(sid: string, body: string, tag = randomTag()): Promise<void> {
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
    throw new Error(`Socket post falló (${response.status})`);
  }
}

function extractSocketSid(handshake: string): string {
  const match = handshake.match(/"sid":"([^"]+)"/);
  if (!match?.[1]) {
    throw new Error("No se pudo abrir sesión socket con insta-stories-viewer");
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
  const handshake = await socketGet();
  const sid = extractSocketSid(handshake);

  await socketPost(sid, "40", "connect");
  await socketGet(sid, "ack");

  const searchPayload = `42["search",${JSON.stringify({
    username: USERNAME,
    date: Date.now(),
    token,
  })}]`;
  await socketPost(sid, searchPayload, "search");

  for (let attempt = 0; attempt < 12; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    const packet = await socketGet(sid, `wait${attempt}`);
    const result = parseSearchResultPayload(packet);
    if (!result) continue;

    if (result.data?.status !== "success") {
      throw new Error("insta-stories-viewer no pudo leer las historias");
    }

    const user = result.data.user;
    return user?.reels?.length ? user.reels : (user?.edges ?? []);
  }

  throw new Error("Timeout esperando historias de insta-stories-viewer");
}

export function buildViewerImageUrl(displayUrl: string): string {
  return `${IMG_CDN}${encodeURIComponent(displayUrl)}`;
}

export async function fetchViewerStories(): Promise<ViewerStoryEdge[]> {
  const token = await fetchConnectToken();
  return searchStories(token);
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
    throw new Error("No se pudo descargar la imagen del story");
  }

  return Buffer.from(await response.arrayBuffer());
}
