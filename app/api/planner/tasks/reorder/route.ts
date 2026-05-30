import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import { reorderPlannerTasks } from "@/lib/planner/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as {
      date?: unknown;
      ids?: unknown;
    };

    if (!isDateKey(body.date) || !Array.isArray(body.ids)) {
      return NextResponse.json(
        { error: "date and ids are required" },
        { status: 400 },
      );
    }

    const ids = body.ids.filter((id): id is string => typeof id === "string");

    await reorderPlannerTasks(user.id, body.date, ids);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to reorder tasks",
      },
      { status: 400 },
    );
  }
}
