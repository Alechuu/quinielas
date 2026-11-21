import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { extractCabezasFromImage } from "./extract-from-image.ts";

test("extractCabezasFromImage decodes Instagram WEBP stories in Node", async () => {
  const webp = await sharp({
    create: {
      width: 1080,
      height: 1920,
      channels: 3,
      background: { r: 25, g: 25, b: 25 },
    },
  })
    .webp()
    .toBuffer();

  const extracted = await extractCabezasFromImage(webp);
  assert.equal(typeof extracted.numerazo === "string" || extracted.numerazo === null, true);
});