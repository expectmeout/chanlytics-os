import { z } from "zod";
import { AppError, TEMPLATE_CATEGORIES, TEMPLATE_LANGUAGES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { draftTemplate } from "@/server/templates";

const Body = z.object({
  brief: z.string().trim().min(4, "Say what you want to tell customers — one line is enough."),
  category: z.string().refine((c) => (TEMPLATE_CATEGORIES as readonly string[]).includes(c), "A template is marketing or utility."),
  language: z.string().optional().refine((l) => l === undefined || TEMPLATE_LANGUAGES.some((x) => x.id === l), "Pick a language from the list."),
});

/**
 * POST /api/v1/templates/draft — { brief, category, language } → a template
 * drafted with the assistant, in the business's voice, inside WhatsApp's
 * rules. A draft, never a submission: the person edits it and submits it
 * themselves. Owner or operator; counted against the workspace's assistant
 * budget like any other assistant turn.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const language = input.language ?? "en_US";
    const r = await draftTemplate(ctx, member.tenantId, { brief: input.brief, category: input.category as "marketing" | "utility", language });
    if (!r.ok) throw new AppError(r.reason === "refused" ? "upstream_anthropic" : "validation", r.message, r.reason === "refused" ? 502 : 422);
    return { draft: r.draft };
  },
});
