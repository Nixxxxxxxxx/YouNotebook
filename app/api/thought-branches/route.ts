import { NextResponse } from "next/server";

import { revalidateThoughtsCache } from "@/lib/thoughts/cache";
import {
  createThoughtBranch,
  listThoughtBranches,
} from "@/lib/thoughts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const branches = await listThoughtBranches();

    return NextResponse.json({ branches });
  } catch (error) {
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
    const body = (await request.json()) as { name?: string };
    const branch = await createThoughtBranch(body.name ?? "");

    revalidateThoughtsCache();

    return NextResponse.json({ branch }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create branch",
      },
      { status: 400 },
    );
  }
}
