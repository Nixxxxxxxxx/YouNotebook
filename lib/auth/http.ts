import { NextResponse } from "next/server";

import {
  createSessionForUser,
  createUserWithPassword,
  deleteSessionByToken,
  verifyUserCredentials,
} from "./repository";
import {
  getExpiredSessionCookieOptions,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "./session";
import { AuthError, type AuthUser } from "./types";
import { validateAuthInput } from "./validation";

type AuthBody = {
  email?: unknown;
  password?: unknown;
};

function getPublicUser(user: AuthUser) {
  return {
    email: user.email,
    id: user.id,
  };
}

export function getAuthErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { code: error.code, error: error.message },
      { status: error.status },
    );
  }

  return NextResponse.json(
    { code: "unknown", error: "Не получилось продолжить. Попробуйте ещё раз" },
    { status: 500 },
  );
}

export async function handleRegister(body: AuthBody) {
  const { email, password } = validateAuthInput(
    body.email,
    body.password,
    "register",
  );
  const user = await createUserWithPassword(email, password);
  const session = await createSessionForUser(user.id);
  const response = NextResponse.json(
    { ok: true, user: getPublicUser(session.user) },
    { status: 201 },
  );

  response.cookies.set(
    SESSION_COOKIE_NAME,
    session.token,
    getSessionCookieOptions(session.expiresAt),
  );

  return response;
}

export async function handleLogin(body: AuthBody) {
  const { email, password } = validateAuthInput(
    body.email,
    body.password,
    "login",
  );
  const user = await verifyUserCredentials(email, password);
  const session = await createSessionForUser(user.id);
  const response = NextResponse.json({ ok: true, user: getPublicUser(user) });

  response.cookies.set(
    SESSION_COOKIE_NAME,
    session.token,
    getSessionCookieOptions(session.expiresAt),
  );

  return response;
}

export async function handleLogout(token: string | undefined) {
  await deleteSessionByToken(token);
  const response = NextResponse.json({ ok: true });

  response.cookies.set(
    SESSION_COOKIE_NAME,
    "",
    getExpiredSessionCookieOptions(),
  );

  return response;
}
