import { NextResponse } from "next/server";

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
    const { id } = await context.params;
    const body = (await request.json()) as { name?: string };
    const branch = await updateThoughtBranch(id, body.name ?? "");

    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    revalidateThoughtsCache();

    return NextResponse.json({ branch });
  } catch (error) {
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
  const { id } = await context.params;
  await deleteThoughtBranch(id);
  revalidateThoughtsCache();

  return NextResponse.json({ ok: true });
}
