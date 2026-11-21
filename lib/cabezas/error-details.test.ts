import assert from "node:assert/strict";
import test from "node:test";
import { formatErrorMessage, serializeError } from "./error-details.ts";

test("formatErrorMessage appends Error.cause message", () => {
  const inner = new TypeError("socket hang up");
  const outer = new Error("fetch failed", { cause: inner });
  assert.equal(
    formatErrorMessage(outer),
    "fetch failed (cause: socket hang up)"
  );
});

test("serializeError preserves nested cause chain", () => {
  const inner = new Error("ENOENT");
  const outer = new Error("worker init failed", { cause: inner });
  const serialized = serializeError(outer);
  assert.equal(serialized.message, "worker init failed");
  assert.ok(serialized.cause && typeof serialized.cause === "object");
});