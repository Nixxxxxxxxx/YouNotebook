import { AuthError } from "@/lib/auth/types";
import { validatePassword } from "@/lib/auth/validation";

export function normalizeTelegramUserId(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

export function validateTelegramUserId(value: unknown) {
  const telegramUserId = normalizeTelegramUserId(value);

  if (!/^\d{5,20}$/.test(telegramUserId)) {
    throw new AuthError(
      "telegram_id_invalid",
      "Введите Telegram user id цифрами",
    );
  }

  return telegramUserId;
}

export function validatePasswordUpdate(body: {
  currentPassword?: unknown;
  nextPassword?: unknown;
}) {
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";
  const nextPassword =
    typeof body.nextPassword === "string" ? body.nextPassword : "";

  validatePassword(currentPassword, "login");
  validatePassword(nextPassword, "register");

  return { currentPassword, nextPassword };
}
