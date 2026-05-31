import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import { createPlannerTasks } from "@/lib/planner/repository";
import { parsePlannerTaskMessage } from "@/lib/planner/telegram";
import { transcribePlannerAudio } from "@/lib/planner/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const formData = await request.formData();
    const audio = formData.get("audio");
    const date = formData.get("date");

    if (!(audio instanceof Blob)) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 },
      );
    }

    const transcript = await transcribePlannerAudio(audio, {
      fileName: audio instanceof File ? audio.name : undefined,
    });
    const inputs = parsePlannerTaskMessage(transcript, {
      defaultDate: isDateKey(date) ? date : undefined,
    });

    if (inputs.length === 0) {
      return NextResponse.json({
        tasks: [],
        transcript,
      });
    }

    const tasks = await createPlannerTasks(user.id, inputs);

    return NextResponse.json({
      tasks,
      transcript,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process voice",
      },
      { status: 400 },
    );
  }
}
