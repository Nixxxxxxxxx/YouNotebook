import { AuthError } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function normalizePassword(password: unknown) {
  return typeof password === "string" ? password : "";
}

export function validateEmail(email: string) {
  if (!email) {
    throw new AuthError("email_empty", "Введите email");
  }

  if (!EMAIL_PATTERN.test(email)) {
    throw new AuthError(
      "email_invalid",
      "Проверьте email — кажется, в нём ошибка",
    );
  }
}

export function validatePassword(password: string, mode: "login" | "register") {
  if (!password) {
    throw new AuthError("password_empty", "Введите пароль");
  }

  if (mode === "register" && password.length < 8) {
    throw new AuthError(
      "password_short",
      "Пароль должен быть не короче 8 символов",
    );
  }
}

export function validateAuthInput(
  emailInput: unknown,
  passwordInput: unknown,
  mode: "login" | "register",
) {
  const email = normalizeEmail(emailInput);
  const password = normalizePassword(passwordInput);

  validateEmail(email);
  validatePassword(password, mode);

  return { email, password };
}
