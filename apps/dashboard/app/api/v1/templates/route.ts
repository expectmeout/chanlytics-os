import { z } from "zod";
import {
  AppError,
  bookingTemplate,
  runsWords,
  templateBlocked,
  templateComponents,
  templateParts,
  templateSends,
  templateUsage,
  validateTemplateDraft,
} from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/route";
import { jsonBody } from "@/server/request-guards";
import { createTemplate } from "@/server/service";

/**
 * GET /api/v1/templates — ONE workspace's approved templates.
 *
 * Scoped explicitly, not by RLS alone. RLS answers "may this caller see this
 * row", and for someone who belongs to two workspaces the answer is yes to
 * both — so this list would have offered another business's templates in the
 * composer, and a send picked from it would have failed the reply route's own
 * tenant check with a confusing "not found".
 *
 * Approved only by default: Meta rejects anything else at the wire, so
 * offering a pending template is offering a send that cannot happen.
 * `?all=1` is for Settings, which shows every template with its status so
 * the owner can see what is in review, rejected or paused. Both carry the
 * category, because a marketing template may only go to people who said yes.
 *
 * POST /api/v1/templates — a template written here, submitted to Meta.
 * { name, language, category, body, footer?, examples }. Owner or operator.
 * Everything Meta refuses at the wire is refused here first, in the person's
 * words (validateTemplateDraft, so the body is the route's own to read); what
 * Meta then says (pending, approved, rejected with a reason) is the row's
 * status, kept current by the webhook.
 */
/**
 * `components` is read but never returned: the row keeps Meta's whole component
 * array (00045, written by the sync and by a create), and the one thing the
 * pages want out of it is the footer -- the line under the words. Sending the
 * array to the browser so three composers can each dig the same string out of it
 * would put Meta's shape in a .jsx file, where the compiler cannot see it.
 */
const COLUMNS =
  "id, channel, name, language, body_preview, variables, category, meta_status, quality, rejected_reason, synced_at, source, hidden_at, title, components";

const Query = z.object({
  /** `1` for Settings: every template with its status. */
  all: z.string().optional(),
});

/** Rows per page: PostgREST's max_rows (supabase config), which answers at most this many whatever a select asks for. */
const PAGE = 1000;

/**
 * Every row a read matches, a page at a time. PostgREST cuts an answer at
 * max_rows without saying so, and a count taken from the first thousand stops
 * growing on exactly the workspaces that send the most. The read must be
 * ordered by something unique, or a page boundary repeats one row and skips
 * another.
 */
async function everyRow<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (;;) {
    const { data, error } = await page(out.length, out.length + PAGE - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return out;
  }
}

export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const tenantId = member.tenantId;
    const all = input.all === "1";
    let q = ctx.supabase.from("templates").select(COLUMNS).eq("tenant_id", tenantId);
    // The composers: approved, and not hidden by the workspace. Settings sees everything.
    if (!all) q = q.eq("meta_status", "approved").is("hidden_at", null);
    const { data, error } = await q.order("name");
    if (error) throw new Error(error.message);
    // The message as the customer receives it -- heading, footer, buttons -- and
    // why this product cannot send it, if it cannot. Meta's array stays behind:
    // three composers digging the same shapes out of it would put Meta's schema
    // in a .jsx file, where the compiler cannot see it.
    const templates = (data ?? []).map(({ components, ...t }) => ({
      ...t,
      ...templateParts(components),
      blocked: templateBlocked({ components }),
    }));
    // What sends each of them, and how many of each went out, for the page that
    // lists every one. The composers (`!all`) are choosing a template to send and
    // never ask, so they do not pay for the reads. A workspace can carry a message
    // nothing has ever sent -- one written in WhatsApp Manager, or a starter added
    // and never wired up -- and this list was the one place that could not say so.
    if (!all) return { templates };
    const [pb, runs, recipients, inbox] = await Promise.all([
      // Its clock, for the line under what sends it ("runs daily at 10:00").
      ctx.supabase
        .from("playbooks")
        .select("id, name, template_name, state, trigger, run_hour, cadence_days")
        .eq("tenant_id", tenantId),
      // Every run, a page at a time: a daily playbook alone passes a thousand of
      // them in three years, and a run cut off the end sent messages nobody is
      // credited with.
      everyRow("broadcasts", (from, to) =>
        // A run's state says whether its playbook is waiting on the owner; a name and a
        // date let a message people send by hand name the latest two.
        ctx.supabase
          .from("broadcasts")
          .select("id, template_name, playbook_id, name, state, created_at")
          .eq("tenant_id", tenantId)
          .order("id")
          .range(from, to),
      ),
      // What LEFT, person by person. A broadcast's `recipient_count` is the
      // audience it was scheduled for; the wire holds people back from it and a
      // run can stop part-way, and Reports › Campaigns counts "Messages sent"
      // from these rows, apart from "Delivered". Counted the way that page counts.
      everyRow("broadcast_recipients", (from, to) =>
        ctx.supabase
          .from("broadcast_recipients")
          .select("broadcast_id, state, sent_at")
          .eq("tenant_id", tenantId)
          .eq("state", "sent")
          .order("broadcast_id")
          .order("contact_id")
          .range(from, to),
      ),
      // The one door a run does not cover: a template the Inbox sent into a closed
      // window, on its own message row. It left when WhatsApp took it -- the
      // wamid; a row still in its veto window, withdrawn or refused has none. A
      // run's own messages name no template (deliver records them without one),
      // so nothing counted on a recipient row above is counted again here.
      everyRow("messages", (from, to) =>
        ctx.supabase
          .from("messages")
          .select("template_name, external_id, created_at")
          .eq("tenant_id", tenantId)
          .eq("direction", "outbound")
          .not("template_name", "is", null)
          .not("external_id", "is", null)
          .order("id")
          .range(from, to),
      ),
    ]);
    if (pb.error) throw new Error(pb.error.message);
    const usedBy = templateUsage({
      playbooks: (pb.data ?? []).map((p) => ({ ...p, runs: runsWords(p) })),
      broadcasts: runs,
      bookingName: bookingTemplate(templates)?.name ?? null,
    });
    const sends = templateSends({ runs, recipients, inbox });
    return { templates, usedBy, sends };
  },
});

const SAID: Record<string, string> = {
  preview: "Submitting only works on the production dashboard.",
  no_channel: "Connect a WhatsApp number first — templates belong to a number's account.",
  no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
  no_token: "Chanlytics has no access token for this number yet.",
  write_failed: "The template was submitted but could not be saved here. Sync from Meta to see it.",
};

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  handle: async ({ ctx, req, member }) => {
    const body = (await jsonBody(req)) as {
      name?: unknown;
      language?: unknown;
      category?: unknown;
      body?: unknown;
      footer?: unknown;
      examples?: unknown;
      labels?: unknown;
      button?: unknown;
    } | null;
    const check = validateTemplateDraft({
      name: typeof body?.name === "string" ? body.name : "",
      language: typeof body?.language === "string" ? body.language : "",
      category: typeof body?.category === "string" ? body.category : "",
      body: typeof body?.body === "string" ? body.body : "",
      footer: typeof body?.footer === "string" ? body.footer : null,
      examples: Array.isArray(body?.examples) ? (body.examples as unknown[]).map(String) : [],
      // One static URL button, its address the workspace's own booking link. The
      // draft check refuses a value in either half, because a button that takes
      // one needs a parameter `sendTemplate` never sends.
      button:
        body?.button && typeof body.button === "object"
          ? {
              text: String((body.button as { text?: unknown }).text ?? ""),
              url: String((body.button as { url?: unknown }).url ?? ""),
            }
          : null,
    });
    if (!check.ok) throw new AppError("validation", check.error);
    const v = check.value;

    const { data: dup, error: dErr } = await ctx.supabase
      .from("templates")
      .select("id")
      .eq("tenant_id", member.tenantId)
      .eq("channel", "whatsapp")
      .eq("name", v.name)
      .eq("language", v.language)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (dup)
      throw new AppError("conflict", "A template with that name and language already exists. Pick another name.", 409);

    const labels = Array.isArray(body?.labels)
      ? (body.labels as unknown[]).map((l) =>
          String(l ?? "")
            .trim()
            .slice(0, 40),
        )
      : [];
    const r = await createTemplate(member.tenantId, ctx.userId, {
      name: v.name,
      language: v.language,
      category: v.category,
      components: templateComponents(v),
      body: v.body,
      examples: v.examples,
      labels: labels.length === v.examples.length ? labels : [],
    });
    if (!r.ok) {
      if (r.reason === "meta_refused")
        throw new AppError(
          "validation",
          `WhatsApp did not accept it: ${r.detail ?? "no reason given"}. Change the message and try again.`,
        );
      const said = SAID[r.reason] ?? `The template could not be submitted (${r.reason}).`;
      throw new AppError(
        r.reason === "no_channel" || r.reason === "no_waba" ? "conflict" : "upstream_meta",
        said,
        r.reason === "no_channel" || r.reason === "no_waba" ? 409 : 502,
      );
    }
    return {
      id: r.id,
      name: v.name,
      language: v.language,
      category: v.category,
      meta_status: r.metaStatus,
      warnings: check.warnings,
    };
  },
});
