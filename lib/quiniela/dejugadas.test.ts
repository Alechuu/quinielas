import assert from "node:assert/strict";
import test from "node:test";
import { parseDejugadasCabezasResponse } from "./dejugadas";

test("parseDejugadas maps momento keys and juego ids", () => {
  const parsed = parseDejugadasCabezasResponse({
    error: 0,
    datos: {
      "1": {
        momento_5: "7570",
        momento_1: "4317",
        momento_2: "4763",
        momento_3: "----",
        momento_4: "----",
      },
      "4": {
        momento_5: "----",
        momento_1: "----",
        momento_2: "928",
        momento_3: "----",
        momento_4: "----",
      },
    },
  });

  assert.equal(parsed.previa.ciudad, "7570");
  assert.equal(parsed.primero.ciudad, "4317");
  assert.equal(parsed.matutina.ciudad, "4763");
  assert.equal(parsed.vespertina.ciudad, undefined);
  assert.equal(parsed.matutina.montevideo, "0928");
});