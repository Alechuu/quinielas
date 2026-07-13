/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: [
    "tesseract.js",
    "tesseract.js-core",
    "wasm-feature-detect",
  ],
  outputFileTracingIncludes: {
    "/api/cabezas": [
      "./node_modules/tesseract.js/src/worker-script/**/*",
      "./node_modules/tesseract.js/src/worker/**/*",
      "./node_modules/tesseract.js/src/utils/**/*",
      "./node_modules/tesseract.js/src/constants/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/wasm-feature-detect/**/*",
      "./node_modules/regenerator-runtime/**/*",
      "./node_modules/is-url/**/*",
      "./node_modules/zlibjs/**/*",
      "./node_modules/node-fetch/**/*",
    ],
  },
};

export default nextConfig;
