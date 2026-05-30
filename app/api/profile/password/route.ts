import { NextResponse } from "next/server";

import { getAuthErrorResponse } from "@/lib/auth/http";
import { updateUserPassword } from "@/lib/auth/repository";
import { getCurrentUser } from "@/lib/auth/server";
import { validatePasswordUpdate } from "@/lib/profile/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { currentPassword, nextPassword } = validatePasswordUpdate(
      (await request.json()) as {
        currentPassword?: unknown;
        nextPassword?: unknown;
      },
    );

    await updateUserPassword(user.id, currentPassword, nextPassword);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return getAuthErrorResponse(error);
  }
}
