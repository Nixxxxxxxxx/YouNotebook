import { NextResponse } from "next/server";

import { revalidateThoughtsCache } from "@/lib/thoughts/cache";
import {
  markThoughtsAsUseful,
  moveThoughtsToBranch,
} from "@/lib/thoughts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      branchId?: string | null;
      ids?: unknown;
      isUseful?: boolean;
    };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "Thought ids are required" },
        { status: 400 },
      );
    }

    const thoughts = body.isUseful
      ? await markThoughtsAsUseful(ids)
      : await moveThoughtsToBranch(ids, body.branchId ?? null);
    revalidateThoughtsCache();

    return NextResponse.json({ thoughts });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update thoughts",
      },
      { status: 400 },
    );
  }
}
