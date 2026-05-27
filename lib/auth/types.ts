export type AuthUser = {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
};

export type AuthSession = {
  expiresAt: Date;
  token: string;
  user: AuthUser;
};

export type AuthErrorCode =
  | "email_empty"
  | "email_invalid"
  | "email_taken"
  | "login_failed"
  | "password_empty"
  | "password_short"
  | "unknown";

export class AuthError extends Error {
  code: AuthErrorCode;
  status: number;

  constructor(code: AuthErrorCode, message: string, status = 400) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}
