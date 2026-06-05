import { NextResponse } from "next/server";

import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import {
  extensionOptionsResponse,
  withExtensionCors,
} from "@/lib/extension/cors";
import { listThoughtBranches } from "@/lib/thoughts/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return extensionOptionsResponse(request);
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUserFromRequest(request);
    const branches = await listThoughtBranches(user.id);

    return withExtensionCors(
      request,
      NextResponse.json({
        collections: branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
        })),
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return withExtensionCors(
        request,
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    }

    return withExtensionCors(
      request,
      NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to load collections",
        },
        { status: 500 },
      ),
    );
  }
}
