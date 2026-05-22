import { NextResponse } from "next/server";

import { fetchTelegramFile } from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ fileId: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { fileId: fileIdParts } = await context.params;
  const fileId = fileIdParts.map((part) => decodeURIComponent(part)).join("/");

  if (!fileId) {
    return NextResponse.json({ error: "File id is required" }, { status: 400 });
  }

  const telegramResponse = await fetchTelegramFile(fileId);
  const headers = new Headers();
  headers.set(
    "content-type",
    telegramResponse.headers.get("content-type") ?? "application/octet-stream",
  );
  headers.set("cache-control", "public, max-age=86400, s-maxage=86400");

  return new Response(telegramResponse.body, {
    status: telegramResponse.status,
    headers,
  });
}
