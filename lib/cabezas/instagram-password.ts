import { createCipheriv, randomBytes } from "crypto";
import { seal } from "tweetnacl-sealedbox-js";

interface InstagramEncryptionConfig {
  key_id: string;
  public_key: string;
  version: string;
}

export async function fetchInstagramEncryptionConfig(
  userAgent: string,
  cookieHeader?: string
): Promise<InstagramEncryptionConfig> {
  const response = await fetch("https://www.instagram.com/data/shared_data/", {
    cache: "no-store",
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      Referer: "https://www.instagram.com/",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(
      `No se pudo obtener la configuración de cifrado de Instagram (${response.status})`
    );
  }

  const json = (await response.json()) as {
    encryption?: InstagramEncryptionConfig;
  };

  const encryption = json.encryption;
  if (!encryption?.public_key || !encryption.key_id || !encryption.version) {
    throw new Error("Instagram no devolvió claves de cifrado válidas");
  }

  return encryption;
}

export function parseEncryptionFromHtml(
  html: string
): InstagramEncryptionConfig | null {
  const match =
    html.match(
      /InstagramPasswordEncryption",\[\],\{"key_id":"(\d+)","public_key":"([a-f0-9]+)","version":"(\d+)"\}/
    ) ??
    html.match(
      /"encryption":\{"key_id":"(\d+)","public_key":"([a-f0-9]+)","version":"(\d+)"\}/
    );
  if (!match) return null;

  return {
    key_id: match[1],
    public_key: match[2],
    version: match[3],
  };
}

export function parseJazoestFromHtml(html: string): string | null {
  const match = html.match(/jazoest=(\d+)/);
  return match?.[1] ?? null;
}

export function parseRolloutHashFromHtml(html: string): string | null {
  const match = html.match(/"rollout_hash":"(\d+)"/);
  return match?.[1] ?? null;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function encryptInstagramPassword(
  password: string,
  encryption: InstagramEncryptionConfig
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const aesKey = randomBytes(32);
  const iv = Buffer.alloc(12);

  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  cipher.setAAD(Buffer.from(String(timestamp), "utf8"));

  const ciphertext = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const publicKeyBytes = hexToBytes(encryption.public_key);
  const sealedKey = seal(new Uint8Array(aesKey), publicKeyBytes);

  const keyId = Number.parseInt(encryption.key_id, 10);
  const payload = Buffer.concat([
    Buffer.from([1, keyId & 0xff]),
    Buffer.from([(sealedKey.length & 0xff) | 0, (sealedKey.length >> 8) & 0xff]),
    Buffer.from(sealedKey),
    authTag,
    ciphertext,
  ]);

  return `#PWD_INSTAGRAM_BROWSER:${encryption.version}:${timestamp}:${payload.toString("base64")}`;
}
