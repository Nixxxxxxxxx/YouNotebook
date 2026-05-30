import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import {
  createPlannerTask,
  createPlannerTasks,
  listPlannerTasks,
} from "@/lib/planner/repository";
import type { PlannerTaskInput } from "@/lib/planner/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTaskInput(input: unknown): PlannerTaskInput | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const rawInput = input as Partial<PlannerTaskInput>;
  const title = typeof rawInput.title === "string" ? rawInput.title : "";

  if (!isDateKey(rawInput.date)) {
    return null;
  }

  return {
    completed: rawInput.completed === true,
    date: rawInput.date,
    sortOrder:
      typeof rawInput.sortOrder === "number" &&
      Number.isFinite(rawInput.sortOrder)
        ? rawInput.sortOrder
        : undefined,
    source: rawInput.source === "telegram" ? "telegram" : "web",
    title,
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!isDateKey(from) || !isDateKey(to)) {
      return NextResponse.json(
        { error: "from and to date keys are required" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      tasks: await listPlannerTasks(user.id, from, to),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load tasks",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as {
      task?: unknown;
      tasks?: unknown;
    } & Partial<PlannerTaskInput>;

    if (Array.isArray(body.tasks)) {
      const inputs = body.tasks
        .map(normalizeTaskInput)
        .filter((input): input is PlannerTaskInput => Boolean(input));

      if (inputs.length === 0) {
        return NextResponse.json(
          { error: "tasks are required" },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { tasks: await createPlannerTasks(user.id, inputs) },
        { status: 201 },
      );
    }

    const input = normalizeTaskInput(body.task ?? body);

    if (!input) {
      return NextResponse.json(
        { error: "task date is required" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { task: await createPlannerTask(user.id, input) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create tasks",
      },
      { status: 400 },
    );
  }
}
