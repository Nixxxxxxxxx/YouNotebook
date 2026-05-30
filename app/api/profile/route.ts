import { NextResponse } from "next/server";

import { listTelegramLinks } from "@/lib/auth/repository";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const telegramLinks = await listTelegramLinks(user.id);

  return NextResponse.json({
    telegramLinks,
    user: {
      createdAt: user.createdAt,
      email: user.email,
      id: user.id,
      lastActiveAt: user.lastActiveAt,
    },
  });
}
