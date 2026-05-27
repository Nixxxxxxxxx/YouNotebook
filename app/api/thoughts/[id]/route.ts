import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
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
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const thought = await getThought(user.id, id);

    if (!thought) {
      return NextResponse.json({ error: "Thought not found" }, { status: 404 });
    }

    return NextResponse.json({ thought });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: "Failed to load thought" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json()) as {
      branchId?: string | null;
      contentText?: string;
      title?: string;
      isUseful?: boolean;
      status?: "inbox" | "archived";
    };
    const thought = await updateThought(user.id, id, body);

    if (!thought) {
      return NextResponse.json({ error: "Thought not found" }, { status: 404 });
    }

    revalidateThoughtsCache(user.id);

    return NextResponse.json({ thought });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    await deleteThought(user.id, id);
    revalidateThoughtsCache(user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: "Failed to delete thought" }, { status: 400 });
  }
}
