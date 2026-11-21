import path from "node:path";
import type { WorkerOptions } from "tesseract.js";

const TESSERACT_ROOT = path.join(process.cwd(), "node_modules/tesseract.js");
const TESSERACT_CORE_ROOT = path.join(process.cwd(), "node_modules/tesseract.js-core");
const TESSERACT_LANG_ROOT = path.join(
  process.cwd(),
  "node_modules/@tesseract.js-data/eng/4.0.0"
);

export function getTesseractWorkerOptions(): Partial<WorkerOptions> {
  return {
    workerPath: path.join(TESSERACT_ROOT, "src/worker-script/node/index.js"),
    corePath: path.join(TESSERACT_CORE_ROOT, "tesseract-core-lstm.wasm.js"),
    langPath: TESSERACT_LANG_ROOT,
    gzip: true,
    cachePath: "/tmp/tesseract",
    workerBlobURL: false,
  };
}