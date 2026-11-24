import assert from "node:assert/strict";
import test from "node:test";
import { emptyParsedData } from "./types";
import { mergeParsedDataFromFallback } from "./merge";

test("merge keeps Notitimba values when both sources have data", () => {
  const primary = emptyParsedData();
  primary.matutina.ciudad = "1111";
  primary.matutina.provincia = "2222";

  const fallback = emptyParsedData();
  fallback.matutina.ciudad = "9999";
  fallback.matutina.provincia = "8888";
  fallback.matutina.cordoba = "3333";

  const merged = mergeParsedDataFromFallback(primary, fallback);
  assert.equal(merged.matutina.ciudad, "1111");
  assert.equal(merged.matutina.provincia, "2222");
  assert.equal(merged.matutina.cordoba, "3333");
});

test("merge fills only missing cells from fallback", () => {
  const primary = emptyParsedData();
  primary.previa.ciudad = "7570";
  primary.primero.ciudad = "4317";

  const fallback = emptyParsedData();
  fallback.previa.ciudad = "0000";
  fallback.primero.ciudad = "0000";
  fallback.matutina.ciudad = "4763";
  fallback.matutina.provincia = "8413";

  const merged = mergeParsedDataFromFallback(primary, fallback);
  assert.equal(merged.previa.ciudad, "7570");
  assert.equal(merged.primero.ciudad, "4317");
  assert.equal(merged.matutina.ciudad, "4763");
  assert.equal(merged.matutina.provincia, "8413");
});

test("merge returns a shallow copy of primary when fallback is empty", () => {
  const primary = emptyParsedData();
  primary.nocturna.provincia = "0388";

  const merged = mergeParsedDataFromFallback(primary, emptyParsedData());
  assert.equal(merged.nocturna.provincia, "0388");
  assert.notEqual(merged, primary);
  assert.equal(merged.nocturna.provincia, primary.nocturna.provincia);
});