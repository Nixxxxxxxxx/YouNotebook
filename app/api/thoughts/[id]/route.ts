import { NextResponse } from "next/server";

import { revalidateThoughtsCache } from "@/lib/thoughts/cache";
import {
  deleteThought,
  getThought,
  updateThought,
} from "@/lib/thoughts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const thought = await getThought(id);

  if (!thought) {
    return NextResponse.json({ error: "Thought not found" }, { status: 404 });
  }

  return NextResponse.json({ thought });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      branchId?: string | null;
      contentText?: string;
      title?: string;
      isUseful?: boolean;
      status?: "inbox" | "archived";
    };
    const thought = await updateThought(id, body);

    if (!thought) {
      return NextResponse.json({ error: "Thought not found" }, { status: 404 });
    }

    revalidateThoughtsCache();

    return NextResponse.json({ thought });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update thought",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  await deleteThought(id);
  revalidateThoughtsCache();

  return NextResponse.json({ ok: true });
}
