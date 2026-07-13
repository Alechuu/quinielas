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
      "./node_modules/tesseract.js-core/**/*.wasm",
      "./node_modules/tesseract.js/**/*.js",
    ],
  },
};

export default nextConfig;
