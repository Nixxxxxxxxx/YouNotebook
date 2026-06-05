import { cookies } from "next/headers";

import { getUserBySessionToken } from "./repository";
import { SESSION_COOKIE_NAME } from "./session";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return getUserBySessionToken(token);
}

export async function getCurrentUserFromRequest(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (match?.[1]) {
    return getUserBySessionToken(match[1]);
  }

  return getCurrentUser();
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export async function requireCurrentUserFromRequest(request: Request) {
  const user = await getCurrentUserFromRequest(request);

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}
