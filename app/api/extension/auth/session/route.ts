import { NextResponse } from "next/server";

import { createSessionForUser } from "@/lib/auth/repository";
import { requireCurrentUser } from "@/lib/auth/server";
import {
  extensionOptionsResponse,
  withExtensionCors,
} from "@/lib/extension/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return extensionOptionsResponse(request);
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const session = await createSessionForUser(user.id);

    return withExtensionCors(
      request,
      NextResponse.json({
        expiresAt: session.expiresAt.toISOString(),
        token: session.token,
        user: {
          email: session.user.email,
          id: session.user.id,
        },
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return withExtensionCors(
        request,
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }

    return withExtensionCors(
      request,
      NextResponse.json({ error: "Failed to create extension session" }, { status: 500 }),
    );
  }
}
