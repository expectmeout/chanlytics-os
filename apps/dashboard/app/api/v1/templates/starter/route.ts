import { AppError, STARTER_TEMPLATES, starterDraft, starterText, templateComponents, validateTemplateDraft } from "@chanlytics/contracts";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { jsonBody } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { createTemplate, syncTemplates } from "@/server/service";

/**
 * POST /api/v1/templates/starter — the starter set, added to this workspace.
 *
 * { keys?: string[], languages?: string[] } — every starter by default, in
 * English by default. Idempotent: a starter already on file is left as it
 * is; one the number's account already holds (a shared account, or written
 * in WhatsApp Manager) is synced in rather than refused; the rest are
 * submitted to Meta for review, exactly as a template written by hand is.
 * Owner or operator. The answer says what happened to each.
 */
type Outcome = "submitted" | "exists" | "synced" | "failed";

interface StarterResult {
  key: string;
  title: string;
  language: string;
  status: Outcome;
  meta_status: string | null;
  detail?: string;
}

const SAID: Record<string, string> = {
  preview: "Adding templates only works on the production dashboard.",
  no_channel: "Connect a WhatsApp number first — templates belong to a number's account.",
  no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
  no_token: "Chanlytics has no access token for this number yet.",
};

const ALREADY_AT_META = /already exist|already in use|duplicate|name.*exists/i;

export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  takeRate(ctx.userId, "settings");
  const body = (await jsonBody(req)) as { keys?: unknown; languages?: unknown } | null;
  const keys = Array.isArray(body?.keys) ? body.keys.filter((k): k is string => typeof k === "string") : STARTER_TEMPLATES.map((s) => s.key);
  const languages = Array.isArray(body?.languages) ? body.languages.filter((l): l is string => typeof l === "string") : ["en_US"];
  const wanted = STARTER_TEMPLATES
    .filter((s) => keys.includes(s.key))
    .flatMap((s) => languages.filter((l) => !!s.texts[l]).map((l) => ({ s, l })));
  if (wanted.length === 0) throw new AppError("validation", "Pick at least one starter template, in English or Spanish.");

  const { data: rows, error } = await ctx.supabase
    .from("templates")
    .select("name, language, meta_status")
    .eq("tenant_id", member.tenantId)
    .eq("channel", "whatsapp")
    .in("name", [...new Set(wanted.map((w) => w.s.name))]);
  if (error) throw new Error(error.message);
  const onFile = (name: string, language: string) => (rows ?? []).find((r) => r.name === name && r.language === language) ?? null;

  const results: StarterResult[] = [];
  let synced = false;
  for (const { s, l } of wanted) {
    const base = { key: s.key, title: s.title, language: l };
    const have = onFile(s.name, l);
    if (have) {
      results.push({ ...base, status: "exists", meta_status: have.meta_status });
      continue;
    }
    const check = validateTemplateDraft(starterDraft(s, l));
    if (!check.ok) {
      results.push({ ...base, status: "failed", meta_status: null, detail: check.error });
      continue;
    }
    const v = check.value;
    const r = await createTemplate(member.tenantId, ctx.userId, {
      name: v.name, language: v.language, category: v.category, components: templateComponents(v), body: v.body, examples: v.examples,
      labels: starterText(s, l).slots.map((x) => x.label),
    });
    if (r.ok) {
      results.push({ ...base, status: "submitted", meta_status: r.metaStatus });
      continue;
    }
    if (r.reason === "meta_refused" && ALREADY_AT_META.test(r.detail ?? "")) {
      // The number's account already holds it: bring it here instead of refusing.
      if (!synced) {
        await syncTemplates(member.tenantId);
        synced = true;
      }
      const { data: now } = await ctx.supabase
        .from("templates")
        .select("meta_status")
        .eq("tenant_id", member.tenantId)
        .eq("channel", "whatsapp")
        .eq("name", s.name)
        .eq("language", l)
        .maybeSingle();
      results.push(now ? { ...base, status: "synced", meta_status: now.meta_status } : { ...base, status: "failed", meta_status: null, detail: r.detail });
      continue;
    }
    if (r.reason in SAID) {
      // Nothing can be added at all: say so once, as the submit route does.
      throw new AppError(r.reason === "preview" || r.reason === "no_token" ? "upstream_meta" : "conflict", SAID[r.reason], r.reason === "preview" || r.reason === "no_token" ? 502 : 409);
    }
    results.push({ ...base, status: "failed", meta_status: null, detail: r.detail ?? r.reason });
  }
  const count = (o: Outcome) => results.filter((x) => x.status === o).length;
  return { results, submitted: count("submitted"), existing: count("exists"), synced: count("synced"), failed: count("failed") };
});
