import { promises as fs } from "fs";
import path from "path";
import type { CabezasData } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "cabezas.json");
const KV_KEY = "quinielas:cabezas";
const PERSIST_TO_DISK = !process.env.VERCEL;

function hasVercelKv(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL &&
      process.env.KV_REST_API_TOKEN &&
      process.env.VERCEL
  );
}

let memoryCache: CabezasData | null = null;

const EMPTY_DATA: CabezasData = {
  numerazo: "",
  laFija: "",
  elEspecial: "",
  source: "manual",
  updatedAt: new Date(0).toISOString(),
};

async function readFromKv(): Promise<CabezasData | null> {
  if (!hasVercelKv()) return null;

  try {
    const { kv } = await import("@vercel/kv");
    const stored = await kv.get<CabezasData>(KV_KEY);
    return stored ?? null;
  } catch (error) {
    console.warn("[Cabezas] No se pudo leer desde Vercel KV:", error);
    return null;
  }
}

async function writeToKv(data: CabezasData): Promise<void> {
  if (!hasVercelKv()) return;

  try {
    const { kv } = await import("@vercel/kv");
    await kv.set(KV_KEY, data);
  } catch (error) {
    console.warn("[Cabezas] No se pudo persistir en Vercel KV:", error);
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
    const parsed = JSON.parse(raw) as CabezasData;
    memoryCache = parsed;
    return parsed;
  } catch {
    return { ...EMPTY_DATA };
  }
}

export async function writeCabezas(data: CabezasData): Promise<CabezasData> {
  memoryCache = data;
  await writeToKv(data);

  if (!PERSIST_TO_DISK) return data;

  try {
    await ensureDataDir();
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.warn("[Cabezas] No se pudo persistir en disco:", error);
  }

  return data;
}