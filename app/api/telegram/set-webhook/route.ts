import { NextResponse } from "next/server";

import { setTelegramWebhook } from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appBaseUrl = process.env.APP_BASE_URL;

  if (!appBaseUrl) {
    return NextResponse.json(
      { error: "APP_BASE_URL is not configured" },
      { status: 400 },
    );
  }

  const result = await setTelegramWebhook(
    `${appBaseUrl.replace(/\/$/, "")}/api/telegram/webhook`,
  );

  return NextResponse.json(result);
}
