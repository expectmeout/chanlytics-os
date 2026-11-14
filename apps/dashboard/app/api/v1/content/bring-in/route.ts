import { write, workspace } from "@/server/shared/route";
import { bringInFor, bringInInput } from "@/server/content/bring-in";

/**
 * POST /api/v1/content/bring-in — `{ link }`: Ask's card's press (content/bring-in.ts). A website is read again for its photos
 * and videos, an Instagram account for its posts and reels; what is brought waits in the Library for its Keep. Whoever may keep
 * what is found, as the Library's Keep.
 *
 * The handle is in src/server/content/bring-in.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: bringInInput,
  handle: ({ ctx, input, member }) => bringInFor(ctx, member, input),
});
