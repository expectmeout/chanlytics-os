import { z } from "zod";
import { write, workspace } from "@/server/route";
import { pauseMailbox, removeMailbox, setMailbox } from "@/server/connections/mailbox-connections";

const Body = z
  .object({
    paused: z.boolean().optional(),
    from_name: z.string().max(200).optional(),
    signature: z.string().max(2000).nullable().optional(),
    signature_off: z.boolean().optional(),
    daily_cap: z.number().int().optional(),
  })
  .strict();

/**
 * PATCH /api/v1/mailbox-connections/:id — { paused?, from_name?, signature?, signature_off?, daily_cap? }
 *
 * The owner's say over a mailbox: pause it or let it send again, and the name it sends as, what it signs with (its own
 * words, none, or with neither the signature they keep in Gmail, read again as they choose it: 00487) and the most
 * it sends a day (never past its ramp or its domain's ceiling: contracts mailboxDailyCap). The edge judges each.
 */
export const PATCH = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const id = String(ctx.params.id ?? "");
    let mailbox = null;
    if (input.paused !== undefined) mailbox = await pauseMailbox(member.tenantId, ctx.userId, id, input.paused);
    const { paused: _paused, ...settings } = input;
    if (Object.keys(settings).length > 0) mailbox = await setMailbox(member.tenantId, ctx.userId, id, settings);
    return { mailbox };
  },
});

/**
 * DELETE /api/v1/mailbox-connections/:id
 *
 * Removed: nothing more leaves from it, its replies are no longer read, and its grant is given back. What it sent
 * stays in its threads; a lead whose chain wrote from it hears nothing more of that chain.
 */
export const DELETE = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: async ({ ctx, member }) => {
    await removeMailbox(member.tenantId, ctx.userId, String(ctx.params.id ?? ""));
    return { removed: true };
  },
});
