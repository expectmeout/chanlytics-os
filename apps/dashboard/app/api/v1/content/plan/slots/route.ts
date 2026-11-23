import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { setSlotFor } from "@/server/content/plan";

/** One change to a slot of the Week. */
const SlotChangeInput = z.discriminatedUnion("to", [
  z.strictObject({ to: z.literal("removed") }),
  z.strictObject({ to: z.literal("proposed"), file_id: z.uuid().optional() }),
  z.strictObject({ to: z.literal("at"), at: z.iso.datetime({ offset: true }) }),
  z.strictObject({ to: z.literal("approved") }),
  z.strictObject({ to: z.literal("post") }),
]);

/**
 * POST /api/v1/content/plan/slots — `{ slot_id, change }`: one slot of the Week (00706): left out, put back (with the clip
 * added for an ask), moved to a later time, approved by itself once mended after the week was or made anew where it could
 * not be (Try again), or, a reel whose video is made, up at its time (`post`). A slot made into a post is the post's.
 * Whoever may approve a post. Answers `{ done, approval_id }`.
 *
 * The handle is in src/server/content/plan.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.strictObject({ slot_id: z.uuid(), change: SlotChangeInput }),
  handle: ({ ctx, input, member }) => setSlotFor(ctx, member, input),
});
