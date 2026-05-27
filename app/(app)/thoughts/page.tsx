import { ThoughtsApp } from "@/components/thoughts/thoughts-app";
import { requireCurrentUser } from "@/lib/auth/server";
import { getCachedInboxThoughts } from "@/lib/thoughts/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ThoughtsPage() {
  const user = await requireCurrentUser();
  const initialData = await getCachedInboxThoughts(user.id);

  return <ThoughtsApp initialData={initialData} />;
}
