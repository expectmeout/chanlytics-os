/**
 * A handover's creation and resend, as the routes read them, apart from handover.ts's words and the room it draws.
 * zod is not built into the browser's contracts (decision 0024, the browser's entry): a page that says these words
 * loads none of it.
 */
import { z } from "zod";

const ownerEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That address is too long.")
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Enter the business owner's email address.");

/** `POST partner/workspaces`: the business's name, its zone, and its owner's address. */
export const HandoverCreateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "A workspace needs a name of at least 2 characters.")
      .max(120, "That name is too long: 120 characters at most."),
    timezone: z.string().trim().max(64).nullish(),
    email: ownerEmail,
  })
  .strict();

/** `POST partner/workspaces/[id]/resend`: the address, the same or another. */
export const HandoverResendSchema = z.object({ email: ownerEmail }).strict();
