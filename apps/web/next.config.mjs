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
};

export default nextConfig;
