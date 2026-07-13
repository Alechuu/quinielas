/** @type {import('next').NextConfig} */
const tesseractRuntimeDeps = [
  "./node_modules/tesseract.js/**/*",
  "./node_modules/tesseract.js-core/**/*",
  "./node_modules/bmp-js/**/*",
  "./node_modules/idb-keyval/**/*",
  "./node_modules/wasm-feature-detect/**/*",
  "./node_modules/regenerator-runtime/**/*",
  "./node_modules/is-url/**/*",
  "./node_modules/zlibjs/**/*",
  "./node_modules/node-fetch/**/*",
];

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
    "bmp-js",
    "wasm-feature-detect",
  ],
  outputFileTracingIncludes: {
    "/api/cabezas": tesseractRuntimeDeps,
  },
};

export default nextConfig;
