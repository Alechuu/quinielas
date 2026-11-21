export function fixNumerazoDigits(digits: string): string | null {
  if (digits.length === 4) return digits;
  if (digits.length === 5) {
    return digits[0] + digits[1] + digits[3] + digits[4];
  }

  const fourDigitBlocks = digits.match(/\d{4}/g) ?? [];
  if (fourDigitBlocks.length === 1) return fourDigitBlocks[0];

  const match = digits.match(/\d{4}/);
  if (match) return match[0];
  if (digits.length > 4) return digits.slice(-4);
  return null;
}

export function pickDigits(text: string, length: number): string | null {
  const parts = text.match(/\d+/g) ?? [];
  const exact = parts.find((part) => part.length === length);
  if (exact) return exact;

  const joined = text.replace(/\D/g, "");
  if (joined.length === length) return joined;
  if (joined.length > length) return joined.slice(0, length);
  return null;
}

/** Prefer isolated 4-digit tokens from OCR output before heuristics on the full string. */
export function pickNumerazo(text: string): string | null {
  const parts = text.match(/\d+/g) ?? [];
  const fourDigitParts = parts.filter((part) => part.length === 4);
  if (fourDigitParts.length === 1) return fourDigitParts[0];
  if (fourDigitParts.length > 1) {
    const withoutYearLike = fourDigitParts.filter((part) => !/^20\d{2}$/.test(part));
    if (withoutYearLike.length === 1) return withoutYearLike[0];
    return fourDigitParts[0];
  }

  return fixNumerazoDigits(text.replace(/\D/g, ""));
}