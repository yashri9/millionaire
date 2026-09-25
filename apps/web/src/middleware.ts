import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

function securityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  // Tight enough for studio + recipient; allow self, supabase storage, and data/blob for audio.
  // Allow pdf.js to fetch cmaps/fonts from jsDelivr when local assets are missing.
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co https://*.storage.supabase.co",
      "media-src 'self' data: blob: https://*.supabase.co https://*.storage.supabase.co",
      "connect-src 'self' https://*.supabase.co https://*.storage.supabase.co wss://*.supabase.co https://api.elevenlabs.io https://api.groq.com https://api.x.ai https://api.anthropic.com https://cdn.jsdelivr.net https://*.googleapis.com",
      "font-src 'self' data: https://cdn.jsdelivr.net",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  return response;
}

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  return securityHeaders(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|mjs|map|woff|woff2|ttf|eot)$).*)",
  ],
};
