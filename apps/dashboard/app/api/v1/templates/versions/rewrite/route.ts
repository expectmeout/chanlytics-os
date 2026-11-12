import { z } from "zod";
import { AppError, TEMPLATE_LANGUAGES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { VERSION_TONES, rewriteVersion } from "@/server/drafts/template/translate";

/** The words a version holds at most, and its subject: past them nobody is writing one message. */
const WORDS_MAX = 4000;
const SUBJECT_MAX = 200;
/** What an owner asks of the words, at most: a sentence or two. */
const ASK_MAX = 300;

const Body = z
  .object({
    channel: z.enum(["email", "sms", "whatsapp"]),
    language: z.string(),
    subject: z.string().max(SUBJECT_MAX).nullable().optional(),
    body: z.string().trim().min(1).max(WORDS_MAX),
    tone: z.enum(VERSION_TONES).optional(),
    /** The owner's own words for what to change (Messages' Ask line), where a tone is not pressed. */
    ask: z.string().trim().min(1).max(ASK_MAX).optional(),
  })
  .superRefine((b, ctx) => {
    if (!b.tone && !b.ask) ctx.addIssue({ code: "custom", path: ["ask"], message: "Say what to change." });
    if (!TEMPLATE_LANGUAGES.some((x) => x.id === b.language))
      ctx.addIssue({ code: "custom", path: ["language"], message: "Pick a language from the list." });
  });

/**
 * POST /api/v1/templates/versions/rewrite — { channel, language, subject?, body, tone | ask } → a message's words on any
 * channel written again, warmer, shorter or as the owner asks in their own words, every value it holds kept (Ask's changes where words are written: the Library's editor,
 * a sequence's step). Words handed back, never saved: the editor's own Save is the person's. Owner or operator; counted
 * against the workspace's assistant budget like any other assistant turn.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const result = await rewriteVersion(ctx, member.tenantId, {
      channel: input.channel,
      language: input.language,
      subject: input.subject ?? null,
      body: input.body,
      tone: input.tone,
      ask: input.ask,
    });
    if (!result.ok)
      throw new AppError(result.reason === "refused" ? "upstream_anthropic" : "validation", result.message);
    return { subject: result.subject, body: result.body };
  },
});
