import { z } from "zod";
import { FixChangeSchema } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { keepRehearsalChange } from "@/server/receptionist/rehearsal";

/**
 * POST /api/v1/receptionist/keep — { rehearsal_id, change, via, channel } (decision 0069): one change kept from a
 * rehearsal or a reviewed call, through the settings' own write (the schema, the version check, the history and
 * settings.changed with where it came from), then the fix on its rehearsal, and what the receptionist now reads where it
 * landed. A change to the settings, so the settings' role and rate. Nothing is sent to anyone.
 */
const Input = z
  .object({
    rehearsal_id: z.uuid(),
    change: FixChangeSchema,
    via: z.enum(["rehearsal", "call_review"]),
    channel: z.enum(["whatsapp", "voice"]),
  })
  .strict();

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: Input,
  handle: ({ ctx, member, input }) => keepRehearsalChange(ctx, member, input),
});
