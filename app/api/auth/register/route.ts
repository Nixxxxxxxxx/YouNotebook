import { getAuthErrorResponse, handleRegister } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    return await handleRegister((await request.json()) as object);
  } catch (error) {
    return getAuthErrorResponse(error);
  }
}
