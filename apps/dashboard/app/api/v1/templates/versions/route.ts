import { z } from "zod";
import { OWN_VERSION_CHANNELS, TEMPLATE_CATEGORIES, type OwnVersionChannel } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { MESSAGE_VALUES_WORDS, saveVersion } from "@/server/campaigns/template-versions";

/**
 * POST /api/v1/templates/versions — the email or text version of a message, in a language, written or rewritten.
 * { name, language, channel: "email" | "sms", subject?, body, message? }. Owner or operator.
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
 * A message may begin as an email or a text, with no WhatsApp row (create_message_version, 00343): the first version of a
 * NEW name carries what its message is and the values it takes, as `message` { category: "marketing" | "utility",
 * variables: [{ position, label, example? }] (numbered 1, 2, 3 in order, as a WhatsApp row's are), title? }. A name that is a
 * starter of the registry begins as the starter (its category and its values; `message` is not read) and only on a
 * channel the starter writes for in that language, with the starter's own words there (anything else is refused: add the
 * starter set, then change the words in the Library). Any other name needs `message`, and is an offer or news: `utility` is
 * the starter's alone, and a text of an offer is refused (texts carry no offers). A name the workspace already holds a row
 * of is a message that exists, so its version is written as above and `message`, if sent, is ignored. With no row, no
 * starter and no `message` the message is not found. A database that has not applied 00343 answers one sentence, 409.
 *
 * The answer is the row's `template` ({ id, name, language, channel }) and the check's `warnings`.
 */
const Message = z.object({
  category: z.enum(TEMPLATE_CATEGORIES, {
    message: "A message is an offer or news, or about their own visit or proposal.",
  }),
  variables: z.array(
    z.object({
      position: z.number({ message: MESSAGE_VALUES_WORDS }).int(MESSAGE_VALUES_WORDS),
      label: z.string({ message: MESSAGE_VALUES_WORDS }),
      example: z.string().nullish(),
    }),
    { message: MESSAGE_VALUES_WORDS },
  ),
  title: z.string().nullish(),
});

const Body = z.object({
  name: z.string({ message: "Say which message." }).min(1, "Say which message."),
  language: z.string({ message: "Pick a language from the list." }),
  channel: z.enum(OWN_VERSION_CHANNELS as readonly [OwnVersionChannel, ...OwnVersionChannel[]], {
    message: "A version is written for email or text.",
  }),
  subject: z.string().nullish(),
  body: z.string({ message: "Write the message." }),
  message: Message.optional(),
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
