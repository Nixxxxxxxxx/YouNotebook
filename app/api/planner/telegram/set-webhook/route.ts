import { NextResponse } from "next/server";

import { setPlannerTelegramWebhook } from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const expected = process.env.PLANNER_TELEGRAM_WEBHOOK_SECRET;

  return (
    Boolean(expected) &&
    request.headers.get("authorization") === `Bearer ${expected}`
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");

  if (!baseUrl) {
    return NextResponse.json(
      { error: "APP_BASE_URL is not configured" },
      { status: 500 },
    );
  }

  const result = await setPlannerTelegramWebhook(
    `${baseUrl}/api/planner/telegram/webhook`,
  );

  return NextResponse.json({ ok: true, result });
}
