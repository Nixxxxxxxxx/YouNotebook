import { NextResponse } from "next/server";

import { getAuthErrorResponse } from "@/lib/auth/http";
import { createTelegramLinkToken } from "@/lib/auth/repository";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTelegramBotUsername() {
  return (
    process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ||
    "YouTodayWithBot"
  );
}

export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const linkToken = await createTelegramLinkToken(user.id);
    const botUsername = getTelegramBotUsername();

    return NextResponse.json({
      expiresAt: linkToken.expiresAt.toISOString(),
      telegramUrl: `https://t.me/${botUsername}?start=${linkToken.token}`,
    });
  } catch (error) {
    return getAuthErrorResponse(error);
  }
}
