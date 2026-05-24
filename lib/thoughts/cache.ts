import { revalidateTag, unstable_cache } from "next/cache";

import { listThoughts } from "./repository";

const THOUGHTS_CACHE_TAG = "thoughts:v1";

export const getCachedInboxThoughts = unstable_cache(
  async () => listThoughts({ view: "inbox" }),
  ["thoughts", "inbox", "v1"],
  {
    revalidate: 300,
    tags: [THOUGHTS_CACHE_TAG],
  },
);

export function revalidateThoughtsCache() {
  revalidateTag(THOUGHTS_CACHE_TAG, "max");
}
