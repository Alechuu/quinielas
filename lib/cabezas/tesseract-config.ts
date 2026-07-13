import path from "node:path";

export function getTesseractWorkerOptions() {
  return {
    workerPath: path.join(
      process.cwd(),
      "node_modules/tesseract.js/src/worker-script/node/index.js"
    ),
  };
}
