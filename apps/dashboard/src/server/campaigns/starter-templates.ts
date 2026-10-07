/**
 * The starter set, added to a workspace (POST /api/v1/templates/starter): { keys?, languages?, channels? }, every starter
 * the workspace is offered by default (contracts startersOffered: the proposal follow-up's only where deals are on,
 * 0006), in English by default, on every channel by default. Idempotent: a starter already on file is left as it is; one
 * the number's account already holds (a shared account, or written in WhatsApp Manager) is synced in rather than
 * refused; the rest are submitted to Meta for review, exactly as a template written by hand is. The answer says what
 * happened to each. When nothing can be added at all (no account on file, no token, a preview) that is said once as a
 * refusal, but only while nothing has been added: past the first submission the rest are marked failed with the same
 * words, so the owner is never told nothing was added while templates sit in review. The route declares who may and how
 * often.
 *
 * Each starter is one message with a version per channel (One message, every channel), and a message needs no WhatsApp
 * row. WhatsApp's version goes to a number's account, so it is made only when WhatsApp is among the channels asked and
 * the workspace has a number: with none it is reported `skipped`, in the words of the edge's own no_channel, and
 * nothing is thrown. The email and text versions, for the channels the starter writes for (a call's text has no email,
 * an offer no text) and the request asks for, are filed through the same door a member's own are (saveVersion's
 * writeOrBegin): beside the WhatsApp row where there is one, else the first of a name begins the message as the starter,
 * with its category and its values, and the other is written beside it. A version already on file is left alone, so a
 * second click never replaces a person's own words; one that cannot be filed is said in its `versions` entry and stops
 * nothing else. The page reads the counts: what was submitted, synced in, already on file and failed at WhatsApp, how
 * many versions were written or could not be, and how many starters' WhatsApp version was skipped.
 */
import {
  AppError,
  CONSENT_CHANNELS,
  LIBRARY_STARTER_WORDS,
  LIBRARY_WORDS,
  OWN_VERSION_CHANNELS,
  dealsAreOn,
  startersOffered,
  starterDraft,
  starterText,
  templateComponents,
  validateTemplateDraft,
  type ConsentChannel,
  type OwnVersionChannel,
  type StarterTemplate,
} from "@chanlytics/contracts";
import { templateStatusOf, templatesNamed, whatsappChannelConfig } from "@chanlytics/db";
import { jsonBody } from "@/server/request-guards";
import { createTemplate, syncTemplates } from "@/server/campaigns/meta-templates";
import { fileStarterVersions, startersFiled, type StarterVersionResult } from "@/server/campaigns/template-versions";
import { sellsByOf } from "@/server/people/deals";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

type Outcome = "submitted" | "exists" | "synced" | "failed" | "skipped";

interface StarterResult {
  key: string;
  title: string;
  language: string;
  status: Outcome;
  meta_status: string | null;
  detail?: string;
  /** The email and text versions of this starter in this language, one entry for each channel it has and was asked for; none when its WhatsApp version failed. */
  versions: StarterVersionResult[];
}

const ALREADY_AT_META = /already exist|already in use|duplicate|name.*exists/i;

/**
 * The channels the set is written on: the request's, or every one when it names none. The number is read only where
 * WhatsApp is among them, for WhatsApp's version is made only where there is a number to make it for.
 */
async function starterChannelsOf(ctx: RouteContext, tenantId: string, asked: unknown) {
  const named = Array.isArray(asked)
    ? asked.filter((c): c is ConsentChannel => CONSENT_CHANNELS.some((x) => x === c))
    : null;
  if (named && named.length === 0) throw new AppError("validation", LIBRARY_STARTER_WORDS.pickAChannel);
  const whatsapp = named ? named.includes("whatsapp") : true;
  const own: OwnVersionChannel[] = OWN_VERSION_CHANNELS.filter((c) => (named ? named.includes(c) : true));
  const number = whatsapp && (await whatsappChannelConfig(ctx.supabase, tenantId)) !== null;
  return { whatsapp, number, own };
}

export async function addStarterTemplates(ctx: RouteContext, req: Request, member: Member) {
  const SAID: Record<string, string> = {
    preview: "Adding templates only works on the production dashboard.",
    no_channel: LIBRARY_WORDS.writeNeedsNumber,
    no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
    no_token: "Chanlytics has no access token for this number yet.",
  };
  const body = (await jsonBody(req)) as { keys?: unknown; languages?: unknown; channels?: unknown } | null;
  // The set this workspace is offered: a starter it is not offered is not filed, asked for or not.
  const offered = startersOffered(dealsAreOn(await sellsByOf(ctx, member.tenantId)));
  const keys = Array.isArray(body?.keys)
    ? body.keys.filter((k): k is string => typeof k === "string")
    : offered.map((s) => s.key);
  const languages = Array.isArray(body?.languages)
    ? body.languages.filter((l): l is string => typeof l === "string")
    : ["en_US"];
  const wanted = offered
    .filter((s) => keys.includes(s.key))
    .flatMap((s) => languages.filter((l) => !!s.texts[l]).map((l) => ({ s, l })));
  if (wanted.length === 0)
    throw new AppError("validation", "Pick at least one starter template, in English or Spanish.");
  const { whatsapp, number, own } = await starterChannelsOf(ctx, member.tenantId, body?.channels);

  const rows = await templatesNamed(ctx.supabase, member.tenantId, [...new Set(wanted.map((w) => w.s.name))]);
  const onFile = (name: string, language: string) =>
    rows.find((r) => r.name === name && r.language === language) ?? null;

  // The email and text versions already here: a second click leaves each as it is.
  const filed = await startersFiled(ctx, member.tenantId, [...new Set(wanted.map((w) => w.s.name))]);
  // The email and text versions asked for: beside a WhatsApp version where there is one, else the first begins the message.
  const versionsOf = (s: StarterTemplate, l: string) => fileStarterVersions(ctx, member.tenantId, s, l, filed, own);

  const results: StarterResult[] = [];
  let synced = false;
  for (const { s, l } of wanted) {
    const base = { key: s.key, title: s.title, language: l };
    const have = onFile(s.name, l);
    if (have) {
      results.push({ ...base, status: "exists", meta_status: have.meta_status, versions: await versionsOf(s, l) });
      continue;
    }
    if (!whatsapp || !number) {
      // No WhatsApp version is made: it was not asked for, or there is no number to make it for. Said where it was asked
      // for, never thrown: the email and text versions are written all the same.
      results.push({
        ...base,
        status: "skipped",
        meta_status: null,
        ...(whatsapp ? { detail: SAID.no_channel } : {}),
        versions: await versionsOf(s, l),
      });
      continue;
    }
    const check = validateTemplateDraft(starterDraft(s, l));
    if (!check.ok) {
      results.push({ ...base, status: "failed", meta_status: null, detail: check.error, versions: [] });
      continue;
    }
    const v = check.value;
    const r = await createTemplate(member.tenantId, ctx.userId, {
      name: v.name,
      language: v.language,
      category: v.category,
      components: templateComponents(v),
      body: v.body,
      examples: v.examples,
      labels: starterText(s, l).slots.map((x) => x.label),
    });
    if (r.ok) {
      results.push({ ...base, status: "submitted", meta_status: r.metaStatus, versions: await versionsOf(s, l) });
      continue;
    }
    if (r.reason === "meta_refused" && ALREADY_AT_META.test(r.detail ?? "")) {
      // The number's account already holds it: bring it here instead of refusing.
      if (!synced) {
        await syncTemplates(member.tenantId, ctx.userId);
        synced = true;
      }
      const now = await templateStatusOf(ctx.supabase, member.tenantId, s.name, l);
      results.push(
        now
          ? { ...base, status: "synced", meta_status: now.meta_status, versions: await versionsOf(s, l) }
          : { ...base, status: "failed", meta_status: null, detail: r.detail, versions: [] },
      );
      continue;
    }
    if (r.reason === "no_channel") {
      // The edge finds no number either: the same answer as having none.
      results.push({
        ...base,
        status: "skipped",
        meta_status: null,
        detail: SAID.no_channel,
        versions: await versionsOf(s, l),
      });
      continue;
    }
    if (r.reason in SAID) {
      // Nothing can be added at all: say so once, as the submit route does --
      // but only while nothing HAS been added. Past the first submission the
      // templates already at Meta are real and in review, and throwing here
      // discarded `results` entirely, so the owner was told nothing was added
      // while several sat waiting for Meta under their account.
      const done = results.some((x) => x.status === "submitted" || x.status === "synced");
      if (!done) {
        throw new AppError(
          r.reason === "preview" || r.reason === "no_token" ? "upstream_meta" : "conflict",
          SAID[r.reason],
          r.reason === "preview" || r.reason === "no_token" ? 502 : 409,
        );
      }
      results.push({ ...base, status: "failed", meta_status: null, detail: SAID[r.reason], versions: [] });
      break;
    }
    results.push({ ...base, status: "failed", meta_status: null, detail: r.detail ?? r.reason, versions: [] });
  }
  const count = (o: Outcome) => results.filter((x) => x.status === o).length;
  const versions = results.flatMap((x) => x.versions);
  const countVersions = (o: StarterVersionResult["status"]) => versions.filter((v) => v.status === o).length;
  return {
    results,
    submitted: count("submitted"),
    existing: count("exists"),
    synced: count("synced"),
    failed: count("failed"),
    skipped: count("skipped"),
    versions_saved: countVersions("saved"),
    versions_existing: countVersions("exists"),
    versions_failed: countVersions("failed"),
  };
}
