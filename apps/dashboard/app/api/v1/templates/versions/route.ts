import { z } from "zod";
import { OWN_VERSION_CHANNELS, type OwnVersionChannel } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { saveVersion } from "@/server/campaigns/template-versions";

/**
 * POST /api/v1/templates/versions — the email or text version of a message, in a language, written or rewritten.
 * { name, language, channel: "email" | "sms", subject?, body }. Owner or operator.
 *
 * A message is a name; a version is a template row of that name on a channel and in a language (One message, every
 * channel). WhatsApp's versions are Meta's and go through POST templates; an email's and a text's are written here, in
 * the same table, and approved at once: nothing reviews them but the person who wrote them. The message must be on file
 * (its WhatsApp row, else another of its rows), whose purpose and slots the version takes. What a version may say is
 * checked first in the person's words (contracts validateOwnVersion): the slots of its message and no others, an
 * email's subject, a text's length with the STOP line the sender adds. A version already on file is rewritten.
 *
 * A reach-out's email is a version too (step 5): its name is `reach_out_` and its step's id, its language is the
 * reach-out's own, and it is written through its chain's own save, with the reach-out's rules over the same email check
 * and what that save guarantees, new words sending what waits for the step back to the check (`rechecked` says how
 * many). It is edited here and in the reach-out's sheet alike, and removed by taking its step out of the chain.
 *
 * The answer is the row's `template` ({ id, name, language, channel }) and the check's `warnings`.
 */
const Body = z.object({
  name: z.string({ message: "Say which message." }).min(1, "Say which message."),
  language: z.string({ message: "Pick a language from the list." }),
  channel: z.enum(OWN_VERSION_CHANNELS as readonly [OwnVersionChannel, ...OwnVersionChannel[]], {
    message: "A version is written for email or text.",
  }),
  subject: z.string().nullish(),
  body: z.string({ message: "Write the message." }),
});

export const POST = write({
  scope: workspace,
  role: "operator",
  // A version is the words playbooks and broadcasts send, and a reach-out's email is saved through its chain's own save,
  // which counts as a playbook change (PUT reach-outs/:id): the same bucket, so a reach-out's words cannot be rewritten
  // faster from here than from its sheet.
  rate: "playbook",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const saved = await saveVersion(ctx, member, input);
    return {
      template: saved.version,
      warnings: saved.warnings,
      ...(saved.rechecked === undefined ? {} : { rechecked: saved.rechecked }),
    };
  },
});
