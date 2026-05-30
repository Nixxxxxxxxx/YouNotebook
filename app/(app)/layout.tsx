import { redirect } from "next/navigation";

import { AppNavigation } from "@/components/app-tabs";
import { getCurrentUser } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <AppNavigation user={user} />
      {children}
    </>
  );
}
