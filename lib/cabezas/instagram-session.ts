import { promises as fs } from "fs";
import path from "path";
import {
  encryptInstagramPassword,
  fetchInstagramEncryptionConfig,
  parseEncryptionFromHtml,
  parseJazoestFromHtml,
  parseRolloutHashFromHtml,
} from "@/lib/cabezas/instagram-password";

const INSTAGRAM_APP_ID = "936619743392459";
const SESSION_FILE = path.join(process.cwd(), "data", "ig-session.json");
const PLAYWRIGHT_COOKIES_FILE = path.join(process.cwd(), "data", "ig-cookies.json");
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

interface CachedSession {
  sessionId: string;
  cookieHeader: string;
  updatedAt: string;
}

let memorySession: CachedSession | null = null;

function parseCookieHeader(setCookieHeaders: string[]): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const header of setCookieHeaders) {
    const [pair] = header.split(";");
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return cookies;
}

function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function readCachedSession(): Promise<CachedSession | null> {
  if (memorySession) return memorySession;

  try {
    const raw = await fs.readFile(SESSION_FILE, "utf8");
    const parsed = JSON.parse(raw) as CachedSession;
    memorySession = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCachedSession(session: CachedSession): Promise<void> {
  memorySession = session;
  await fs.mkdir(path.dirname(SESSION_FILE), { recursive: true });
  await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), "utf8");
}

function isSessionFresh(session: CachedSession): boolean {
  const age = Date.now() - new Date(session.updatedAt).getTime();
  return age < SESSION_MAX_AGE_MS;
}

function formatLoginError(json: {
  message?: string;
  error_type?: string;
  exception_name?: string;
  is_user_inactivated_error?: boolean;
}): string {
  if (json.message) return json.message;
  if (json.is_user_inactivated_error) {
    return "La cuenta burner de Instagram está inactiva o bloqueada";
  }
  if (
    json.error_type === "FakeIncorrectPassword" ||
    json.exception_name === "FakeIncorrectPassword"
  ) {
    return "Instagram bloqueó un re-login inmediato. Reintentá en unos minutos.";
  }
  if (json.error_type === "UserInvalidCredentials") {
    return "Usuario o contraseña de Instagram incorrectos en .env";
  }
  return "No se pudo iniciar sesión en Instagram";
}

async function readPlaywrightCookieSession(): Promise<CachedSession | null> {
  try {
    const raw = await fs.readFile(PLAYWRIGHT_COOKIES_FILE, "utf8");
    const cookies = JSON.parse(raw) as Array<{ name: string; value: string }>;
    const sessionId = cookies.find((cookie) => cookie.name === "sessionid")?.value;
    if (!sessionId) return null;

    return {
      sessionId,
      cookieHeader: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fetchInstagramLoginPage(): Promise<{
  cookies: Record<string, string>;
  encryption: ReturnType<typeof parseEncryptionFromHtml>;
  jazoest: string | null;
  rolloutHash: string | null;
}> {
  const response = await fetch("https://www.instagram.com/accounts/login/", {
    cache: "no-store",
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo abrir Instagram (${response.status})`);
  }

  const html = await response.text();
  const setCookie = response.headers.getSetCookie?.() ?? [];
  return {
    cookies: parseCookieHeader(setCookie),
    encryption: parseEncryptionFromHtml(html),
    jazoest: parseJazoestFromHtml(html),
    rolloutHash: parseRolloutHashFromHtml(html),
  };
}

async function loginWithCredentials(
  username: string,
  password: string
): Promise<CachedSession> {
  const { cookies, encryption: htmlEncryption, jazoest, rolloutHash } =
    await fetchInstagramLoginPage();
  const csrfToken = cookies.csrftoken;
  if (!csrfToken) {
    throw new Error("No se pudo obtener csrftoken de Instagram");
  }

  const cookieHeader = buildCookieHeader(cookies);
  let encryption = htmlEncryption;
  if (!encryption) {
    encryption = await fetchInstagramEncryptionConfig(USER_AGENT, cookieHeader);
  }
  const encPassword = encryptInstagramPassword(password, encryption);
  const body = new URLSearchParams({
    username,
    enc_password: encPassword,
    queryParams: "{}",
    optIntoOneTap: "false",
    ...(jazoest ? { jazoest } : {}),
  });

  const response = await fetch(
    "https://www.instagram.com/api/v1/web/accounts/login/ajax/",
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
        "x-csrftoken": csrfToken,
        "x-ig-app-id": INSTAGRAM_APP_ID,
        "x-requested-with": "XMLHttpRequest",
        "x-asbd-id": "359341",
        "x-instagram-ajax": rolloutHash ?? "1",
        Origin: "https://www.instagram.com",
        Referer: "https://www.instagram.com/accounts/login/",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        Cookie: cookieHeader,
      },
      body,
    }
  );

  const setCookie = response.headers.getSetCookie?.() ?? [];
  const mergedCookies = { ...cookies, ...parseCookieHeader(setCookie) };

  let json: {
    authenticated?: boolean;
    userId?: string;
    message?: string;
    status?: string;
    user?: boolean | { message?: string };
    error_type?: string;
    exception_name?: string;
    is_user_inactivated_error?: boolean;
    is_vetted?: boolean;
    two_factor_required?: boolean;
    challenge?: unknown;
  } = {};

  try {
    json = (await response.json()) as typeof json;
  } catch {
    const text = await response.text();
    throw new Error(
      `Login de Instagram inválido (${response.status}: ${text.slice(0, 120)})`
    );
  }

  if (json.two_factor_required || json.challenge) {
    throw new Error(
      "Instagram pidió verificación extra en la cuenta burner. Entrá una vez desde el navegador y volvé a intentar."
    );
  }

  if (!json.authenticated || !mergedCookies.sessionid) {
    throw new Error(formatLoginError(json));
  }

  const session: CachedSession = {
    sessionId: mergedCookies.sessionid,
    cookieHeader: buildCookieHeader(mergedCookies),
    updatedAt: new Date().toISOString(),
  };

  await writeCachedSession(session);
  return session;
}

async function validateSession(session: CachedSession): Promise<boolean> {
  const response = await fetch(
    `https://i.instagram.com/api/v1/feed/user/${process.env.INSTAGRAM_TARGET_USER_ID ?? "53058245823"}/story/`,
    {
      cache: "no-store",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        "x-ig-app-id": INSTAGRAM_APP_ID,
        "x-requested-with": "XMLHttpRequest",
        Referer: "https://www.instagram.com/",
        Origin: "https://www.instagram.com",
        Cookie: session.cookieHeader,
      },
    }
  );

  if (response.status === 401 || response.status === 403) {
    return false;
  }

  return response.ok;
}

export async function getInstagramSession(
  forceRefresh = false
): Promise<CachedSession> {
  const envSessionId = process.env.INSTAGRAM_SESSION_ID?.trim();
  const username = process.env.IG_USERNAME?.trim();
  const password = process.env.IG_PASSWORD?.trim();

  if (!forceRefresh) {
    const cached = await readCachedSession();
    const cachedFresh = cached ? isSessionFresh(cached) : false;
    const cachedValid = cached ? await validateSession(cached) : false;
    if (cached && cachedFresh && cachedValid) {
      return cached;
    }

    if (envSessionId) {
      const envSession: CachedSession = {
        sessionId: envSessionId,
        cookieHeader: `sessionid=${envSessionId}`,
        updatedAt: new Date().toISOString(),
      };
      const envValid = await validateSession(envSession);
      if (envValid) {
        await writeCachedSession(envSession);
        return envSession;
      }
    }

    const playwrightSession = await readPlaywrightCookieSession();
    if (playwrightSession) {
      const playwrightValid = await validateSession(playwrightSession);
      if (playwrightValid) {
        await writeCachedSession(playwrightSession);
        return playwrightSession;
      }
    }
  }

  if (!username || !password) {
    throw new Error(
      "Configurá IG_USERNAME e IG_PASSWORD en .env para iniciar sesión automáticamente"
    );
  }

  const session = await loginWithCredentials(username, password);
  const newSessionValid = await validateSession(session);
  if (!newSessionValid) {
    throw new Error("La sesión nueva de Instagram no pudo leer stories");
  }

  return session;
}

export async function getInstagramSessionId(
  forceRefresh = false
): Promise<string> {
  const session = await getInstagramSession(forceRefresh);
  return session.sessionId;
}

export function getInstagramCookieHeader(session: CachedSession): string {
  return session.cookieHeader;
}
