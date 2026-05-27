import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import { revalidateThoughtsCache } from "@/lib/thoughts/cache";
import { createThought, listThoughts } from "@/lib/thoughts/repository";
import type { ThoughtListFilter } from "@/lib/thoughts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getFilter(request: Request): ThoughtListFilter {
  const url = new URL(request.url);
  const view = url.searchParams.get("view");
  const branchId = url.searchParams.get("branchId");

  if (view === "branch" && branchId) {
    return { view, branchId };
  }

  if (view === "collections") {
    return { view };
  }

  if (view === "useful") {
    return { view };
  }

  return { view: "inbox" };
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const result = await listThoughts(user.id, getFilter(request));

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load thoughts",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as {
      input?: string;
      branchId?: string | null;
      isUseful?: boolean;
    };
    const thought = await createThought(user.id, {
      input: body.input ?? "",
      branchId: body.branchId ?? null,
      isUseful: body.isUseful ?? false,
      sourceType: "manual",
    });

    revalidateThoughtsCache(user.id);

    return NextResponse.json({ thought }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create thought",
      },
      { status: 400 },
    );
  }
}
