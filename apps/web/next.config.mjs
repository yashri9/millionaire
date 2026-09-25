import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: [
    "@voxdeck/narration",
    "@voxdeck/decks",
    "@voxdeck/auth",
    "@voxdeck/ui",
  ],
  // Server-only, and @napi-rs/canvas ships a native .node binary webpack
  // can't bundle — externalize so it's require()'d directly at runtime.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "pdfjs-dist", "yauzl"],
  // Monorepo install puts these at the repo root; without tracing includes,
  // Vercel lambdas miss the canvas .node binary and pdfjs font/cmap assets,
  // so render falls back to text-only (no images, no Vision OCR).
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/pdfjs-dist/cmaps/**/*",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/legacy/**/*",
      "../../node_modules/@napi-rs/canvas/**/*",
      "../../node_modules/pdfjs-dist/cmaps/**/*",
      "../../node_modules/pdfjs-dist/standard_fonts/**/*",
      "../../node_modules/pdfjs-dist/legacy/**/*",
    ],
  },
};

export default nextConfig;
