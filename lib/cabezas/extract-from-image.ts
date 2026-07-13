import { decode as decodeWebp } from "@jsquash/webp";
import Jimp from "jimp";
import Tesseract from "tesseract.js";

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

async function loadImage(buffer: Buffer): Promise<Jimp> {
  if (isWebp(buffer)) {
    const { data, width, height } = await decodeWebp(buffer);
    return new Jimp({ data: Buffer.from(data), width, height });
  }

  return Jimp.read(buffer);
}

export interface ExtractedCabezas {
  numerazo: string | null;
  laFija: string | null;
  elEspecial: string | null;
}

const TARGET_HEIGHT = 2048;

const REGIONS = {
  numerazo: { x: 0.2, y: 0.42, w: 0.6, h: 0.07 },
  bottom: { x: 0.05, y: 0.55, w: 0.9, h: 0.18 },
  fijaInBottom: { x: 0, y: 0, w: 0.5, h: 0.55 },
  especialInBottom: { x: 0.5, y: 0, w: 0.5, h: 0.55 },
};

function fixNumerazoDigits(digits: string): string | null {
  if (digits.length === 4) return digits;
  if (digits.length === 5) return digits[0] + digits[1] + digits[3] + digits[4];
  const match = digits.match(/\d{4}/);
  if (match) return match[0];
  if (digits.length > 4) return digits.slice(-4);
  return null;
}

function pickDigits(text: string, length: number): string | null {
  const parts = text.match(/\d+/g) ?? [];
  const exact = parts.find((part) => part.length === length);
  if (exact) return exact;

  const joined = text.replace(/\D/g, "");
  if (joined.length === length) return joined;
  if (joined.length > length) return joined.slice(0, length);
  return null;
}

async function cropFromBuffer(
  source: Buffer,
  width: number,
  height: number,
  region: { x: number; y: number; w: number; h: number },
  resizeWidth?: number
): Promise<Buffer> {
  const left = Math.min(Math.round(width * region.x), Math.max(0, width - 1));
  const top = Math.min(Math.round(height * region.y), Math.max(0, height - 1));
  const cropWidth = Math.min(Math.round(width * region.w), width - left);
  const cropHeight = Math.min(Math.round(height * region.h), height - top);

  const image = await loadImage(source);
  image.crop(left, top, cropWidth, cropHeight);

  if (resizeWidth) {
    image.resize(resizeWidth, Jimp.AUTO);
  }

  return image.getBufferAsync(Jimp.MIME_PNG);
}

async function enhanceForOcr(buffer: Buffer): Promise<Buffer> {
  const image = await loadImage(buffer);
  image.greyscale().normalize();
  return image.getBufferAsync(Jimp.MIME_PNG);
}

export async function extractCabezasFromImage(
  imageBuffer: Buffer
): Promise<ExtractedCabezas> {
  const source = await loadImage(imageBuffer);
  const sourceWidth = source.getWidth();
  const sourceHeight = source.getHeight();
  const scale = TARGET_HEIGHT / sourceHeight;
  const targetWidth = Math.round(sourceWidth * scale);

  const normalized = source
    .clone()
    .resize(targetWidth, TARGET_HEIGHT)
    .getBufferAsync(Jimp.MIME_PNG);

  const worker = await Tesseract.createWorker("eng");

  try {
    const normalizedBuffer = await normalized;

    const numerazoBuffer = await cropFromBuffer(
      normalizedBuffer,
      targetWidth,
      TARGET_HEIGHT,
      REGIONS.numerazo,
      900
    ).then(enhanceForOcr);

    const bottomBuffer = await cropFromBuffer(
      normalizedBuffer,
      targetWidth,
      TARGET_HEIGHT,
      REGIONS.bottom
    );
    const bottomImage = await loadImage(bottomBuffer);
    const bottomWidth = bottomImage.getWidth();
    const bottomHeight = bottomImage.getHeight();

    const fijaBuffer = await cropFromBuffer(
      bottomBuffer,
      bottomWidth,
      bottomHeight,
      REGIONS.fijaInBottom,
      500
    ).then(enhanceForOcr);

    const especialBuffer = await cropFromBuffer(
      bottomBuffer,
      bottomWidth,
      bottomHeight,
      REGIONS.especialInBottom,
      500
    ).then(enhanceForOcr);

    const [numerazoResult, fijaResult, especialResult] = await Promise.all([
      worker.recognize(numerazoBuffer),
      worker.recognize(fijaBuffer),
      worker.recognize(especialBuffer),
    ]);

    const numerazoDigits = numerazoResult.data.text.replace(/\D/g, "");
    const numerazo = fixNumerazoDigits(numerazoDigits);
    const laFija = pickDigits(fijaResult.data.text, 3);
    const elEspecial = pickDigits(especialResult.data.text, 2);

    return { numerazo, laFija, elEspecial };
  } finally {
    await worker.terminate();
  }
}

export function isValidExtraction(
  extracted: ExtractedCabezas
): extracted is Required<ExtractedCabezas> {
  return Boolean(
    extracted.numerazo &&
      /^\d{4}$/.test(extracted.numerazo) &&
      extracted.laFija &&
      /^\d{3}$/.test(extracted.laFija) &&
      extracted.elEspecial &&
      /^\d{2}$/.test(extracted.elEspecial)
  );
}

export async function isCabezasStoryImage(imageBuffer: Buffer): Promise<boolean> {
  const image = await loadImage(imageBuffer);
  image.resize(100, 100);

  const { data } = image.bitmap;
  let red = 0;
  let green = 0;
  let blue = 0;

  for (let i = 0; i < data.length; i += 4) {
    red += data[i];
    green += data[i + 1];
    blue += data[i + 2];
  }

  const pixels = data.length / 4;
  const avgRed = red / pixels;
  const avgGreen = green / pixels;
  const avgBlue = blue / pixels;

  return avgBlue > avgRed + 50 && avgGreen > avgRed + 50;
}
