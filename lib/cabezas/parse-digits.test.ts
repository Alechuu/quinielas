import assert from "node:assert/strict";
import test from "node:test";
import {
  fixNumerazoDigits,
  pickDigits,
  pickNumerazo,
} from "./parse-digits.ts";

test("fixNumerazoDigits keeps valid 4-digit values", () => {
  assert.equal(fixNumerazoDigits("1234"), "1234");
});

test("fixNumerazoDigits repairs common 5-digit OCR mistakes", () => {
  assert.equal(fixNumerazoDigits("12345"), "1245");
});

test("fixNumerazoDigits finds embedded 4-digit sequences", () => {
  assert.equal(fixNumerazoDigits("99123488"), "9912");
});

test("pickDigits prefers exact-length tokens", () => {
  assert.equal(pickDigits("text 222 and 20", 3), "222");
  assert.equal(pickDigits("9 20", 2), "20");
});

test("pickNumerazo prefers isolated 4-digit tokens", () => {
  assert.equal(pickNumerazo("NUMERAZO 4567 extra 89012"), "4567");
  assert.equal(pickNumerazo("20 26 3344 1102"), "3344");
});