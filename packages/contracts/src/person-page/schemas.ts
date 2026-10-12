/**
 * What the person page's new routes take (decision 0052): POST people/:id/name, PUT people/:id/business and POST
 * contacts/:id/call.
 */
import { z } from "zod";
import { isRealDate } from "../config/workspace-config/config-rules";
import { PERSON_CALL_OUTCOMES, PERSON_CALL_SAID_MAX } from "./call";

/** Use, undo or decline a reply's signer's name. */
export const PersonNameActSchema = z.discriminatedUnion("act", [
  z.object({ act: z.literal("adopt"), message_id: z.uuid({ message: "Name the reply whose signer to use." }) }),
  z.object({ act: z.literal("undo") }),
  z.object({ act: z.literal("decline"), message_id: z.uuid({ message: "Name the reply whose signer to decline." }) }),
]);
export type PersonNameAct = z.infer<typeof PersonNameActSchema>;

/** Link a person to a business of the workspace. */
export const PersonWorksAtSchema = z.object({
  lead_id: z.uuid({ message: "Choose a business from your leads." }),
});

/** A call the member made, logged (person_call_logged): how it went, what was said, the day to call back, and who answered. */
export const PersonCallSchema = z
  .object({
    outcome: z.enum(PERSON_CALL_OUTCOMES, { message: "Say how the call went." }),
    said: z.string().trim().max(PERSON_CALL_SAID_MAX).optional(),
    /** The day to call back, which makes the note a step (00166): a real day by the business's calendar. */
    due_on: z.string().refine(isRealDate, "A day, as 2026-09-30.").nullable().optional(),
    /** The receptionist reads the note: off, it is the team's only. */
    tell: z.boolean().optional(),
    /** Who answered a stand-in's number, under Interested (0052). */
    spoke_with: z.string().trim().max(80).optional(),
  })
  .strict();
export type PersonCallBody = z.infer<typeof PersonCallSchema>;
