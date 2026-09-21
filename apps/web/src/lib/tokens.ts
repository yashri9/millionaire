import "server-only";

/**
 * tokens.ts — share-link tokens (PRD §11: cryptographically random, not
 * guessable/enumerable). A recipient link is https://<domain>/d/{token}.
 */
import { randomBytes } from "crypto";

export function generateShareToken(): string {
  // 24 bytes -> 32-char base64url; ~192 bits of entropy, non-enumerable.
  return randomBytes(24).toString("base64url");
}
