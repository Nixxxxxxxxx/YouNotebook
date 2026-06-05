import { NextResponse } from "next/server";

import { requireCurrentUserFromRequest } from "@/lib/auth/server";
import {
  extensionOptionsResponse,
  withExtensionCors,
} from "@/lib/extension/cors";
import { revalidateThoughtsCache } from "@/lib/thoughts/cache";
import { createReferenceThoughtsBulk } from "@/lib/thoughts/repository";
import type { BulkReferenceSaveInput } from "@/lib/thoughts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return extensionOptionsResponse(request);
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUserFromRequest(request);
    const body = (await request.json()) as {
      collectionId?: string | null;
      items?: unknown;
    };
    const items = Array.isArray(body.items) ? body.items : [];
    const result = await createReferenceThoughtsBulk(user.id, {
      branchId: body.collectionId ?? null,
      items: items as BulkReferenceSaveInput["items"],
    });

    if (result.saved > 0) {
      revalidateThoughtsCache(user.id);
    }

    return withExtensionCors(request, NextResponse.json(result));
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
            error instanceof Error ? error.message : "Failed to save references",
        },
        { status: 400 },
      ),
    );
  }
}
