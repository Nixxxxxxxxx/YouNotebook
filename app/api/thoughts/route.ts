import { NextResponse } from "next/server";

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
    const result = await listThoughts(getFilter(request));

    return NextResponse.json(result);
  } catch (error) {
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
    const body = (await request.json()) as {
      input?: string;
      branchId?: string | null;
      isUseful?: boolean;
    };
    const thought = await createThought({
      input: body.input ?? "",
      branchId: body.branchId ?? null,
      isUseful: body.isUseful ?? false,
      sourceType: "manual",
    });

    return NextResponse.json({ thought }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create thought",
      },
      { status: 400 },
    );
  }
}
