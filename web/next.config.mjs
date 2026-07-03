/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Server-only, and @napi-rs/canvas ships a native .node binary webpack
  // can't bundle — externalize so it's require()'d directly at runtime.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "pdfjs-dist", "yauzl"],
};

export default nextConfig;
