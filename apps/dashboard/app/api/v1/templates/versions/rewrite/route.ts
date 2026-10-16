import { z } from "zod";
import { AppError, TEMPLATE_LANGUAGES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { VERSION_TONES, rewriteVersion } from "@/server/campaigns/templates";

/** The words a version holds at most, and its subject: past them nobody is writing one message. */
const WORDS_MAX = 4000;
const SUBJECT_MAX = 200;

const Body = z
  .object({
    channel: z.enum(["email", "sms"]),
    language: z.string(),
    subject: z.string().max(SUBJECT_MAX).nullable().optional(),
    body: z.string().trim().min(1).max(WORDS_MAX),
    tone: z.enum(VERSION_TONES),
  })
  .superRefine((b, ctx) => {
    if (!TEMPLATE_LANGUAGES.some((x) => x.id === b.language))
      ctx.addIssue({ code: "custom", path: ["language"], message: "Pick a language from the list." });
  });

/**
 * POST /api/v1/templates/versions/rewrite — { channel, language, subject?, body, tone } → a message's email or text words
 * written again, warmer or shorter, every value it holds kept (Ask's changes where words are written: the Library's editor,
 * a sequence's step). Words handed back, never saved: the editor's own Save is the person's. Owner or operator; counted
 * against the workspace's assistant budget like any other assistant turn.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const r = await rewriteVersion(ctx, member.tenantId, {
      channel: input.channel,
      language: input.language,
      subject: input.subject ?? null,
      body: input.body,
      tone: input.tone,
    });
    if (!r.ok) throw new AppError(r.reason === "refused" ? "upstream_anthropic" : "validation", r.message);
    return { subject: r.subject, body: r.body };
  },
});
