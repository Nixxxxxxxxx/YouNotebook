import { NextResponse } from "next/server";

import { getCurrentUserFromRequest } from "@/lib/auth/server";
import {
  extensionOptionsResponse,
  withExtensionCors,
} from "@/lib/extension/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return extensionOptionsResponse(request);
}

export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest(request);

  if (!user) {
    return withExtensionCors(
      request,
      NextResponse.json({ authenticated: false }, { status: 401 }),
    );
  }

  return withExtensionCors(
    request,
    NextResponse.json({
      authenticated: true,
      user: {
        email: user.email,
        id: user.id,
      },
    }),
  );
}
