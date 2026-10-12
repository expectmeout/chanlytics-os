/**
 * What the person page's new routes take (decision 0052): POST people/:id/name and PUT people/:id/business.
 */
import { z } from "zod";

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
