import { NextResponse } from "next/server";

import {
  listPlannerTasksByDate,
  listPlannerTelegramDigestTargets,
  savePlannerChecklistTaskMappings,
} from "@/lib/planner/repository";
import {
  getMoscowDateKey,
  getPlannerTelegramChecklist,
  getPlannerTelegramChecklistTaskIds,
  getPlannerTelegramListOptions,
  getPlannerTelegramReplyMarkup,
  renderPlannerTelegramList,
} from "@/lib/planner/telegram";
import {
  sendPlannerTelegramChecklist,
  sendPlannerTelegramMessage,
} from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;

  return (
    Boolean(expected) &&
    request.headers.get("authorization") === `Bearer ${expected}`
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateKey = getMoscowDateKey();
  const targets = await listPlannerTelegramDigestTargets();
  let sent = 0;
  const errors: string[] = [];

  for (const target of targets) {
    const tasks = await listPlannerTasksByDate(target.userId, dateKey);
    const meaningfulTasks = tasks.filter((task) => task.title.trim().length > 0);

    if (meaningfulTasks.length === 0) {
      continue;
    }

    try {
      const checklist =
        target.businessEnabled && target.businessConnectionId
          ? getPlannerTelegramChecklist(dateKey, tasks)
          : null;

      if (target.businessConnectionId && checklist) {
        const result = await sendPlannerTelegramChecklist(
          target.businessConnectionId,
          target.businessUserChatId ?? target.chatId,
          checklist,
        );
        const messageId = result.result?.message_id;

        if (messageId) {
          await savePlannerChecklistTaskMappings({
            businessConnectionId: target.businessConnectionId,
            chatId: target.businessUserChatId ?? target.chatId,
            messageId,
            taskIds: getPlannerTelegramChecklistTaskIds(tasks),
          });
        }

        sent += 1;
        continue;
      }

      await sendPlannerTelegramMessage(
        target.chatId,
        renderPlannerTelegramList(dateKey, tasks),
        getPlannerTelegramListOptions(getPlannerTelegramReplyMarkup(tasks)),
      );
      sent += 1;
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `${target.userId}: ${error.message}`
          : `${target.userId}: Unknown error`,
      );
    }
  }

  return NextResponse.json({
    date: dateKey,
    errors,
    ok: errors.length === 0,
    sent,
    targets: targets.length,
  });
}
