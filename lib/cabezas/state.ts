import { readCabezas } from "@/lib/cabezas/storage";
import type { CabezasData } from "@/lib/cabezas/types";

export async function getCabezasState(): Promise<CabezasData> {
  return readCabezas();
}