import { isCabezasStoryImage } from "@/lib/cabezas/extract-from-image";
import {
  getInstagramCookieHeader,
  getInstagramSession,
} from "@/lib/cabezas/instagram-session";

const INSTAGRAM_USERNAME = "agenciapuntoybanca";
const INSTAGRAM_APP_ID = "936619743392459";
const INSTAGRAM_USER_ID = "53058245823";

export interface StoryMedia {
  imageUrl: string;
  takenAt: number;
}

interface InstagramStoryItem {
  taken_at?: number;
  media_type?: number;
  image_versions2?: {
    candidates?: Array<{ url?: string; width?: number }>;
  };
  video_versions?: Array<{ url?: string }>;
}

function getCsrfToken(cookieHeader: string): string | undefined {
  const match = cookieHeader.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match?.[1];
}

function buildInstagramHeaders(cookieHeader: string): Record<string, string> {
  const csrfToken = getCsrfToken(cookieHeader);
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    Accept: "*/*",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    "x-ig-app-id": INSTAGRAM_APP_ID,
    "x-requested-with": "XMLHttpRequest",
    ...(csrfToken ? { "x-csrftoken": csrfToken } : {}),
    Referer: `https://www.instagram.com/${INSTAGRAM_USERNAME}/`,
    Origin: "https://www.instagram.com",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    Cookie: cookieHeader,
  };
}

function pickBestImageUrl(
  candidates: Array<{ url?: string; width?: number }> = []
): string | null {
  const sorted = [...candidates].sort(
    (a, b) => (b.width ?? 0) - (a.width ?? 0)
  );
  return sorted.find((candidate) => candidate.url)?.url ?? null;
}

function toStoryMedia(item: InstagramStoryItem): StoryMedia | null {
  const imageUrl = pickBestImageUrl(item.image_versions2?.candidates);
  if (!imageUrl || !item.taken_at) return null;

  return {
    imageUrl,
    takenAt: item.taken_at,
  };
}

async function fetchUserId(cookieHeader: string): Promise<string> {
  const response = await fetch(
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${INSTAGRAM_USERNAME}`,
    {
      cache: "no-store",
      headers: buildInstagramHeaders(cookieHeader),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `No se pudo obtener el perfil de Instagram (${response.status}: ${body.slice(0, 80)})`
    );
  }

  const json = (await response.json()) as {
    data?: { user?: { id?: string } };
  };
  const userId = json.data?.user?.id;
  if (!userId) {
    throw new Error("No se encontró el ID del perfil de Instagram");
  }

  return userId;
}

async function fetchStoryItems(
  userId: string,
  cookieHeader: string
): Promise<InstagramStoryItem[]> {
  const headers = buildInstagramHeaders(cookieHeader);

  const storyResponse = await fetch(
    `https://i.instagram.com/api/v1/feed/user/${userId}/story/`,
    {
      cache: "no-store",
      headers,
    }
  );

  if (storyResponse.ok) {
    const json = (await storyResponse.json()) as {
      reel?: { items?: InstagramStoryItem[] };
    };
    const items = json.reel?.items ?? [];
    if (items.length > 0) {
      return items;
    }
  }

  const reelsResponse = await fetch(
    `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`,
    {
      cache: "no-store",
      headers,
    }
  );

  if (!reelsResponse.ok) {
    return [];
  }

  const reelsJson = (await reelsResponse.json()) as {
    reels?: Record<string, { items?: InstagramStoryItem[] }>;
    reels_media?: Array<{ items?: InstagramStoryItem[] }>;
  };

  return (
    reelsJson.reels?.[userId]?.items ??
    reelsJson.reels_media?.[0]?.items ??
    []
  );
}

export async function fetchLatestStoryImage(): Promise<StoryMedia | null> {
  const session = await getInstagramSession();
  let userId = INSTAGRAM_USER_ID;

  try {
    userId = (await fetchUserId(session.cookieHeader)) || INSTAGRAM_USER_ID;
  } catch {
    userId = INSTAGRAM_USER_ID;
  }

  const storyItems = await fetchStoryItems(userId, session.cookieHeader);

  const stories = storyItems
    .map((item) => toStoryMedia(item))
    .filter((story): story is StoryMedia => story !== null)
    .sort((a, b) => b.takenAt - a.takenAt);

  if (stories.length === 0) {
    return null;
  }

  const downloadHeaders = buildInstagramHeaders(session.cookieHeader);

  for (const story of stories) {
    const response = await fetch(story.imageUrl, {
      cache: "no-store",
      headers: {
        ...downloadHeaders,
        Referer: "https://www.instagram.com/",
      },
    });

    if (!response.ok) continue;

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (await isCabezasStoryImage(imageBuffer)) {
      return story;
    }
  }

  return null;
}

export async function downloadStoryImage(imageUrl: string): Promise<Buffer> {
  const session = await getInstagramSession();
  const headers = buildInstagramHeaders(getInstagramCookieHeader(session));

  const response = await fetch(imageUrl, {
    cache: "no-store",
    headers: {
      ...headers,
      Referer: "https://www.instagram.com/",
    },
  });

  if (!response.ok) {
    throw new Error("No se pudo descargar la imagen del story");
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
