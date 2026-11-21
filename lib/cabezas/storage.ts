import { Redis } from "@upstash/redis";
import { promises as fs } from "fs";
import path from "path";
import { formatErrorMessage, serializeError } from "@/lib/cabezas/error-details";
import type { CabezasData } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "cabezas.json");
const KV_KEY = "quinielas:cabezas";
const PERSIST_TO_DISK = !process.env.VERCEL;

let memoryCache: CabezasData | null = null;

const EMPTY_DATA: CabezasData = {
  numerazo: "",
  laFija: "",
  elEspecial: "",
  source: "manual",
  updatedAt: new Date(0).toISOString(),
};

function getKvRestUrl(): string | undefined {
  return process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
}

function getKvReadToken(): string | undefined {
  return (
    process.env.KV_REST_API_READ_ONLY_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function getKvWriteToken(): string | undefined {
  return (
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_READ_ONLY_TOKEN
  );
}

function getRedisForRead(): Redis | null {
  const url = getKvRestUrl();
  const token = getKvReadToken();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function getRedisForWrite(): Redis | null {
  const url = getKvRestUrl();
  const token = getKvWriteToken();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function shouldUseKv(): boolean {
  return Boolean(getKvRestUrl() && getKvReadToken());
}

function normalizeCabezasData(raw: unknown): CabezasData | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  if (
    typeof record.numerazo !== "string" ||
    typeof record.laFija !== "string" ||
    typeof record.elEspecial !== "string" ||
    typeof record.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    numerazo: record.numerazo,
    laFija: record.laFija,
    elEspecial: record.elEspecial,
    fecha: typeof record.fecha === "string" ? record.fecha : undefined,
    source: record.source === "instagram" ? "instagram" : "manual",
    updatedAt: record.updatedAt,
    storyImageUrl:
      typeof record.storyImageUrl === "string" ? record.storyImageUrl : undefined,
    storyTakenAt:
      typeof record.storyTakenAt === "number" ? record.storyTakenAt : undefined,
    syncDayKey:
      typeof record.syncDayKey === "string" ? record.syncDayKey : undefined,
    foundForDay:
      typeof record.foundForDay === "boolean" ? record.foundForDay : undefined,
    lastSyncAttemptAt:
      typeof record.lastSyncAttemptAt === "string"
        ? record.lastSyncAttemptAt
        : undefined,
  };
}

async function readFromKv(): Promise<CabezasData | null> {
  if (!shouldUseKv()) return null;

  try {
    const redis = getRedisForRead();
    if (!redis) return null;
    const stored = await redis.get<unknown>(KV_KEY);
    if (!stored) return null;
    return normalizeCabezasData(stored);
  } catch (error) {
    console.warn(
      "[Cabezas] No se pudo leer desde KV:",
      formatErrorMessage(error),
      serializeError(error)
    );
    return null;
  }
}

async function writeToKv(data: CabezasData): Promise<void> {
  if (!shouldUseKv()) return;

  try {
    const redis = getRedisForWrite();
    if (!redis) return;
    await redis.set(KV_KEY, data);
  } catch (error) {
    console.warn(
      "[Cabezas] No se pudo persistir en KV:",
      formatErrorMessage(error),
      serializeError(error)
    );
  }
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readCabezas(): Promise<CabezasData> {
  if (memoryCache) return memoryCache;

  const fromKv = await readFromKv();
  if (fromKv) {
    memoryCache = fromKv;
    return fromKv;
  }

  if (!PERSIST_TO_DISK) return { ...EMPTY_DATA };

  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = normalizeCabezasData(JSON.parse(raw));
    if (parsed) {
      memoryCache = parsed;
      return parsed;
    }
  } catch (error) {
    console.warn(
      "[Cabezas] No se pudo leer desde disco:",
      formatErrorMessage(error)
    );
  }

  return { ...EMPTY_DATA };
}

export async function writeCabezas(data: CabezasData): Promise<CabezasData> {
  memoryCache = data;
  await writeToKv(data);

  if (!PERSIST_TO_DISK) return data;

  try {
    await ensureDataDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.warn(
      "[Cabezas] No se pudo persistir en disco:",
      formatErrorMessage(error)
    );
  }

  return data;
}