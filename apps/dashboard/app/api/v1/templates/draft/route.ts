import { z } from "zod";
import { AppError, TEMPLATE_CATEGORIES, TEMPLATE_LANGUAGES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { draftTemplate, translateTemplate, translationSource, type SourceRef } from "@/server/templates";

/**
 * Two drafts, one door. A brief: what to tell customers, written fresh. Or
 * `translate`: a message the workspace has, written again in another language
 * -- a row on file by its id, or a starter by its key -- so a message is one
 * thing in every language it has, not a new message to name and write per
 * language.
 */
const Body = z
  .object({
    brief: z.string().trim().optional(),
    category: z.string().optional(),
    language: z.string().optional(),
    translate: z
      .object({
        id: z.string().uuid().optional(),
        starter: z.string().max(60).optional(),
        from: z.string().max(16).optional(),
      })
      .strict()
      .optional(),
  })
  .superRefine((b, ctx) => {
    if (b.language !== undefined && !TEMPLATE_LANGUAGES.some((x) => x.id === b.language)) {
      ctx.addIssue({ code: "custom", path: ["language"], message: "Pick a language from the list." });
    }
    if (b.translate) {
      if (!b.translate.id === !b.translate.starter)
        ctx.addIssue({
          code: "custom",
          path: ["translate"],
          message: "Say which template to write in another language.",
        });
      if (b.language === undefined)
        ctx.addIssue({ code: "custom", path: ["language"], message: "Pick a language from the list." });
      return;
    }
    if (!b.brief || b.brief.length < 4)
      ctx.addIssue({
        code: "custom",
        path: ["brief"],
        message: "Say what you want to tell customers — one line is enough.",
      });
    if (!(TEMPLATE_CATEGORIES as readonly (string | undefined)[]).includes(b.category))
      ctx.addIssue({ code: "custom", path: ["category"], message: "A template is marketing or utility." });
  });

/**
 * POST /api/v1/templates/draft — { brief, category, language } → a template
 * drafted with the assistant, in the business's voice, inside WhatsApp's
 * rules; or { translate: { id } | { starter, from? }, language } → that
 * template written again in `language`, the same name, slots and button. A
 * draft, never a submission: the person edits it and submits it themselves.
 * Owner or operator; counted against the workspace's assistant budget like any
 * other assistant turn. A translation that could not be submitted -- a language
 * the message has, a heading Chanlytics cannot carry -- is refused before the
 * assistant is asked.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    if (input.translate) {
      const language = input.language as string;
      const ref: SourceRef = input.translate.id
        ? { id: input.translate.id }
        : { starter: input.translate.starter as string, from: input.translate.from ?? null };
      const src = await translationSource(ctx, member.tenantId, ref, language);
      if (!src.ok) throw new AppError(src.code, src.message);
      const t = await translateTemplate(ctx, member.tenantId, { source: src.source, language });
      if (!t.ok)
        throw new AppError(
          t.reason === "refused" ? "upstream_anthropic" : "validation",
          t.message,
          t.reason === "refused" ? 502 : 422,
        );
      return { draft: t.draft };
    }
    const language = input.language ?? "en_US";
    const r = await draftTemplate(ctx, member.tenantId, {
      brief: input.brief as string,
      category: input.category as "marketing" | "utility",
      language,
    });
    if (!r.ok)
      throw new AppError(
        r.reason === "refused" ? "upstream_anthropic" : "validation",
        r.message,
        r.reason === "refused" ? 502 : 422,
      );
    return { draft: r.draft };
  },
});
