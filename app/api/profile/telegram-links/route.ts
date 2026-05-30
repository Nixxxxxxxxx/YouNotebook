import { NextResponse } from "next/server";

import { getAuthErrorResponse } from "@/lib/auth/http";
import {
  addTelegramLink,
  listTelegramLinks,
  removeTelegramLink,
} from "@/lib/auth/repository";
import { getCurrentUser } from "@/lib/auth/server";
import { validateTelegramUserId } from "@/lib/profile/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUserOrUnauthorized() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
    };
  }

  return { response: null, user };
}

export async function POST(request: Request) {
  const { response, user } = await getUserOrUnauthorized();

  if (!user) {
    return response;
  }

  try {
    const body = (await request.json()) as { telegramUserId?: unknown };
    const telegramUserId = validateTelegramUserId(body.telegramUserId);

    await addTelegramLink(user.id, telegramUserId);

    return NextResponse.json({
      ok: true,
      telegramLinks: await listTelegramLinks(user.id),
    });
  } catch (error) {
    return getAuthErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const { response, user } = await getUserOrUnauthorized();

  if (!user) {
    return response;
  }

  try {
    const body = (await request.json()) as { telegramUserId?: unknown };
    const telegramUserId = validateTelegramUserId(body.telegramUserId);

    await removeTelegramLink(user.id, telegramUserId);

    return NextResponse.json({
      ok: true,
      telegramLinks: await listTelegramLinks(user.id),
    });
  } catch (error) {
    return getAuthErrorResponse(error);
  }
}
