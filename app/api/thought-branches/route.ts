import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import { revalidateThoughtsCache } from "@/lib/thoughts/cache";
import {
  createThoughtBranch,
  listThoughtBranches,
} from "@/lib/thoughts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const branches = await listThoughtBranches(user.id);

    return NextResponse.json({ branches });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load branches",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as { name?: string };
    const branch = await createThoughtBranch(user.id, body.name ?? "");

    revalidateThoughtsCache(user.id);

    return NextResponse.json({ branch }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create branch",
      },
      { status: 400 },
    );
  }
}
