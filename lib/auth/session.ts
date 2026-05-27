import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "quietly_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

export function createSessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export function getSessionCookieOptions(expires: Date) {
  return {
    expires,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function getExpiredSessionCookieOptions() {
  return {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
