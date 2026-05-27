import { listThoughts } from "./repository";

export function getCachedInboxThoughts(userId: string) {
  return listThoughts(userId, { view: "inbox" });
}

export function revalidateThoughtsCache(_userId?: string) {
  void _userId;
  // Thought data is user-scoped and loaded dynamically after auth.
}
