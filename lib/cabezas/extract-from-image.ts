import Jimp from "jimp";
import sharp from "sharp";
import Tesseract from "tesseract.js";
import {
  fixNumerazoDigits,
  pickDigits,
  pickNumerazo,
} from "@/lib/cabezas/parse-digits";
import { getTesseractWorkerOptions } from "@/lib/cabezas/tesseract-config";

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

async function loadImage(buffer: Buffer): Promise<Jimp> {
  if (isWebp(buffer)) {
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return new Jimp({
      data: Buffer.from(data),
      width: info.width,
      height: info.height,
    });
  }

  return Jimp.read(buffer);
}

export interface ExtractedCabezas {
  numerazo: string | null;
  laFija: string | null;
  elEspecial: string | null;
}

export interface ValidatedCabezas {
  numerazo: string;
  laFija: string;
  elEspecial: string;
}

const TARGET_HEIGHT = 2048;

const REGIONS = {
  numerazo: { x: 0.2, y: 0.42, w: 0.6, h: 0.07 },
  bottom: { x: 0.05, y: 0.55, w: 0.9, h: 0.18 },
  fijaInBottom: { x: 0, y: 0, w: 0.5, h: 0.55 },
  especialInBottom: { x: 0.5, y: 0, w: 0.5, h: 0.55 },
};

const NUMERAZO_REGION_FALLBACKS = [
  REGIONS.numerazo,
  { x: 0.15, y: 0.38, w: 0.7, h: 0.08 },
  { x: 0.15, y: 0.44, w: 0.7, h: 0.08 },
];

export { fixNumerazoDigits, pickDigits, pickNumerazo };

async function cropFromImage(
  image: Jimp,
  width: number,
  height: number,
  region: { x: number; y: number; w: number; h: number },
  resizeWidth?: number
): Promise<Jimp> {
  const left = Math.min(Math.round(width * region.x), Math.max(0, width - 1));
  const top = Math.min(Math.round(height * region.y), Math.max(0, height - 1));
  const cropWidth = Math.min(Math.round(width * region.w), width - left);
  const cropHeight = Math.min(Math.round(height * region.h), height - top);

  const cropped = image
    .clone()
    .crop(left, top, cropWidth, cropHeight);

  if (resizeWidth) {
    cropped.resize(resizeWidth, Jimp.AUTO);
  }

  return cropped;
}

async function enhanceForOcr(image: Jimp): Promise<Buffer> {
  return image
    .clone()
    .greyscale()
    .normalize()
    .contrast(0.35)
    .getBufferAsync(Jimp.MIME_PNG);
}

async function recognizeNumerazo(
  worker: Tesseract.Worker,
  normalized: Jimp,
  targetWidth: number
): Promise<string | null> {
  const candidates: string[] = [];

  for (const region of NUMERAZO_REGION_FALLBACKS) {
    const crop = await cropFromImage(
      normalized,
      targetWidth,
      TARGET_HEIGHT,
      region,
      900
    );
    const buffer = await enhanceForOcr(crop);
    const result = await worker.recognize(buffer);
    const picked = pickNumerazo(result.data.text);
    if (picked && /^\d{4}$/.test(picked)) {
      return picked;
    }
    if (picked) {
      candidates.push(picked);
    }
  }

  const fallback = candidates.find((value) => /^\d{4}$/.test(value));
  if (fallback) return fallback;

  const digits = candidates.join("").replace(/\D/g, "");
  return fixNumerazoDigits(digits);
}

export async function extractCabezasFromImage(
  imageBuffer: Buffer
): Promise<ExtractedCabezas> {
  const source = await loadImage(imageBuffer);
  const sourceWidth = source.getWidth();
  const sourceHeight = source.getHeight();
  const scale = TARGET_HEIGHT / sourceHeight;
  const targetWidth = Math.round(sourceWidth * scale);

  const normalized = source.clone().resize(targetWidth, TARGET_HEIGHT);

  const worker = await Tesseract.createWorker("eng", 1, getTesseractWorkerOptions());

  try {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    });

    const bottomImage = await cropFromImage(
      normalized,
      targetWidth,
      TARGET_HEIGHT,
      REGIONS.bottom
    );
    const bottomWidth = bottomImage.getWidth();
    const bottomHeight = bottomImage.getHeight();

    const fijaBuffer = await enhanceForOcr(
      await cropFromImage(
        bottomImage,
        bottomWidth,
        bottomHeight,
        REGIONS.fijaInBottom,
        500
      )
    );

    const especialBuffer = await enhanceForOcr(
      await cropFromImage(
        bottomImage,
        bottomWidth,
        bottomHeight,
        REGIONS.especialInBottom,
        500
      )
    );

    const [numerazo, fijaResult, especialResult] = await Promise.all([
      recognizeNumerazo(worker, normalized, targetWidth),
      worker.recognize(fijaBuffer),
      worker.recognize(especialBuffer),
    ]);

    const laFija = pickDigits(fijaResult.data.text, 3);
    const elEspecial = pickDigits(especialResult.data.text, 2);

    return { numerazo, laFija, elEspecial };
  } finally {
    await worker.terminate();
  }
}

export function isValidExtraction(
  extracted: ExtractedCabezas
): extracted is ValidatedCabezas {
  return Boolean(
    extracted.numerazo &&
      /^\d{4}$/.test(extracted.numerazo) &&
      extracted.laFija &&
      /^\d{3}$/.test(extracted.laFija) &&
      extracted.elEspecial &&
      /^\d{2}$/.test(extracted.elEspecial)
  );
}