/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse / officeparser are server-only; keep them out of client bundles.
  serverExternalPackages: ["pdf-parse", "officeparser"],
};

export default nextConfig;
