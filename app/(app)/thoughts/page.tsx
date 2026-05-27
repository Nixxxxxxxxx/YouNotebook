import { redirect } from "next/navigation";

import { ThoughtsApp } from "@/components/thoughts/thoughts-app";
import { getCurrentUser } from "@/lib/auth/server";
import { getCachedInboxThoughts } from "@/lib/thoughts/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ThoughtsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const initialData = await getCachedInboxThoughts(user.id);

  return <ThoughtsApp initialData={initialData} />;
}
