import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import { revalidateThoughtsCache } from "@/lib/thoughts/cache";
import {
  deleteThoughtBranch,
  updateThoughtBranch,
} from "@/lib/thoughts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getBranchErrorMessage(error: unknown, fallback: string) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  if (code === "23505") {
    return "Такая коллекция уже есть";
  }

  return error instanceof Error ? error.message : fallback;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json()) as { name?: string };
    const branch = await updateThoughtBranch(user.id, id, body.name ?? "");

    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    revalidateThoughtsCache(user.id);

    return NextResponse.json({ branch });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: getBranchErrorMessage(
          error,
          "Failed to update thought branch",
        ),
      },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    await deleteThoughtBranch(user.id, id);
    revalidateThoughtsCache(user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: getBranchErrorMessage(error, "Failed to delete thought branch") },
      { status: 400 },
    );
  }
}
