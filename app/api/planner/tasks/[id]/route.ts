import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import { deletePlannerTask, updatePlannerTask } from "@/lib/planner/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = (await request.json()) as {
      completed?: unknown;
      date?: unknown;
      sortOrder?: unknown;
      title?: unknown;
    };
    const task = await updatePlannerTask(user.id, id, {
      completed:
        typeof body.completed === "boolean" ? body.completed : undefined,
      date: isDateKey(body.date) ? body.date : undefined,
      sortOrder:
        typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
          ? body.sortOrder
          : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update task",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    await deletePlannerTask(user.id, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete task",
      },
      { status: 400 },
    );
  }
}
