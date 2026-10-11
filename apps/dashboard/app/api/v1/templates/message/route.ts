import { z } from "zod";
import { PARAM_SOURCES, TEMPLATE_CATEGORIES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { writeMessage } from "@/server/campaigns/write-message";

/**
 * POST /api/v1/templates/message — a message written whole, every version at once, filed as a starter is filed (Ask's
 * message card commits through it). Owner or operator, at the rate a template submitted to Meta is.
 *
 * { name, language, category: "marketing" | "utility", versions: { whatsapp?: { body, footer? }, email?: { subject,
 * body }, sms?: { body } }, slots: [{ position, label, example?, kind }] }. Everything that could refuse it is said first
 * and nothing is filed: a text of an offer (texts carry no offers), a `utility` message with no WhatsApp version for Meta
 * to review (a message somebody writes is an offer or news, as POST templates/versions says), words a channel refuses,
 * a twin (the same name and language on file, 409). Then the email and text versions are filed at once, approved, and WhatsApp's last, sent to
 * Meta for review, so a refusal there leaves the others filed. The answer is { name, language, versions: [{ channel, id,
 * state: "approved" | "pending" }], refused?: { channel, words } }: each version filed, and the first that could not be.
 *
 * The handle is writeMessage in src/server/campaigns/write-message.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
const Slot = z.object({
  position: z.number().int(),
  label: z.string(),
  example: z.string().optional(),
  kind: z.enum(PARAM_SOURCES),
});

const Body = z.object({
  name: z.string({ message: "Say which message." }),
  language: z.string({ message: "Pick a language from the list." }),
  category: z.enum(TEMPLATE_CATEGORIES, { message: "A template is marketing or utility." }),
  versions: z.object({
    whatsapp: z.object({ body: z.string(), footer: z.string().optional() }).optional(),
    email: z.object({ subject: z.string(), body: z.string() }).optional(),
    sms: z.object({ body: z.string() }).optional(),
  }),
  slots: z.array(Slot),
});

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  input: Body,
  handle: ({ ctx, member, input }) => writeMessage(ctx, member, input),
});

/** Its WhatsApp version is a round trip to Meta after the others are filed: room for it, so the answer saying what was filed is never lost to the platform's ceiling. */
export const maxDuration = 60;
