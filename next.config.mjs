/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["tesseract.js", "sharp"],
  outputFileTracingIncludes: {
    "/api/cabezas": [
      "./node_modules/tesseract.js-core/tesseract-core-simd.wasm",
      "./node_modules/tesseract.js-core/tesseract-core.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-lstm.wasm",
    ],
  },
};

export default nextConfig;
