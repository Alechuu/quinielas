export interface CabezasData {
  numerazo: string;
  laFija: string;
  elEspecial: string;
  fecha?: string;
  source: "instagram" | "manual";
  updatedAt: string;
  storyImageUrl?: string;
  storyTakenAt?: number;
}

export interface CabezasSyncResult {
  ok: boolean;
  data?: CabezasData;
  error?: string;
  extracted?: {
    numerazo: string | null;
    laFija: string | null;
    elEspecial: string | null;
  };
}
