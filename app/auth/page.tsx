import { AuthScreen } from "@/components/auth/auth-screen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthPreviewPageProps = {
  searchParams?: Promise<{
    mode?: string | string[];
  }>;
};

export default async function AuthPreviewPage({
  searchParams,
}: AuthPreviewPageProps) {
  const params = await searchParams;
  const requestedMode = Array.isArray(params?.mode)
    ? params?.mode[0]
    : params?.mode;
  const mode = requestedMode === "login" ? "login" : "register";
  const switchHref = mode === "login" ? "/auth?mode=register" : "/auth?mode=login";

  return <AuthScreen mode={mode} switchHref={switchHref} />;
}
