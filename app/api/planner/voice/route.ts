import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/server";
import {
  createPlannerTasks,
  getPlannerVoiceUsageStats,
  recordPlannerVoiceUsage,
} from "@/lib/planner/repository";
import { parsePlannerTaskMessage } from "@/lib/planner/telegram";
import {
  getPlannerVoiceProviderInfo,
  getPlannerVoiceUsageSummary,
  transcribePlannerAudio,
} from "@/lib/planner/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDurationSeconds(value: FormDataEntryValue | null) {
  const durationSeconds = Number(value);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }

  return Math.max(1, Math.min(7200, Math.ceil(durationSeconds)));
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const stats = await getPlannerVoiceUsageStats(user.id);

    return NextResponse.json({
      usage: getPlannerVoiceUsageSummary(stats),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Failed to load voice usage" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const formData = await request.formData();
    const audio = formData.get("audio");
    const date = formData.get("date");
    const durationSeconds = parseDurationSeconds(
      formData.get("durationSeconds"),
    );

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
    const providerInfo = getPlannerVoiceProviderInfo();

    await recordPlannerVoiceUsage(user.id, {
      durationSeconds,
      provider: providerInfo.provider,
      source: "web",
    });
    const usage = getPlannerVoiceUsageSummary(
      await getPlannerVoiceUsageStats(user.id),
    );

    if (inputs.length === 0) {
      return NextResponse.json({
        tasks: [],
        transcript,
        usage,
      });
    }

    const tasks = await createPlannerTasks(user.id, inputs);

    return NextResponse.json({
      tasks,
      transcript,
      usage,
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
