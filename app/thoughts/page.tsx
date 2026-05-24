import { ThoughtsApp } from "@/components/thoughts/thoughts-app";
import { getCachedInboxThoughts } from "@/lib/thoughts/cache";

export const dynamic = "force-dynamic";

export default async function ThoughtsPage() {
  const initialData = await getCachedInboxThoughts();

  return <ThoughtsApp initialData={initialData} />;
}
