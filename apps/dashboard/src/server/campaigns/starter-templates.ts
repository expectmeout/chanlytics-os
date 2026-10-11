/**
 * The starter set, added to a workspace (POST /api/v1/templates/starter): { keys?, languages?, channels? }, every starter
 * the workspace is offered by default (contracts startersOffered: the proposal follow-up's only where deals are on,
 * 0006, and the review ask's only where the Google listing keeps a review link, 00394), in English by default, on every
 * channel by default. Idempotent: a starter already on file is left as it is; one
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
 *
 * A new campaign may name one starter in place of a message (POST playbooks with `starter_key`, the moment spec's A0):
 * it is judged whole before anything is filed (checkStarterPlaybook, which Ask's starter card runs too), and only where
 * it goes by a channel the starter's message holds at once is the starter filed by the same code (withStarterMessage).
 */
import {
  AppError,
  CONSENT_CHANNELS,
  FOLLOW_UP_ONE,
  LIBRARY_STARTER_WORDS,
  LIBRARY_WORDS,
  OWN_VERSION_CHANNELS,
  PLAYBOOK_LIMITS,
  campaignMessageOf,
  channelNeverCarries,
  channelsWords,
  dealsAreOn,
  defaultParamSpecs,
  enrolPurpose,
  messageFitsMoment,
  messageHolds,
  startersForTrigger,
  startersOffered,
  starterDraft,
  starterEmailText,
  starterSmsText,
  starterText,
  templateComponents,
  triggerWords,
  validateTemplateDraft,
  type AskedPurpose,
  type ConsentChannel,
  type OwnVersionChannel,
  type ParamSpec,
  type PlaybookMessage,
  type PlaybookPolicyClass,
  type StarterTemplate,
  type triggerOf,
} from "@chanlytics/contracts";
import {
  TEMPLATE_VALUE_WORDS,
  parseChannels,
  playbookNumber,
  refuseWithoutBookingLink,
  refuseWithoutReviewLink,
} from "@chanlytics/core";
import {
  followUpOnFile,
  messageVersionRowsOf,
  reviewLinkOf,
  templateStatusOf,
  templatesNamed,
  whatsappChannelFacts,
} from "@chanlytics/db";
import { templateValuePorts } from "@/server/ports/campaign-ports";
import { jsonBody } from "@/server/request-guards";
import { createTemplate, syncTemplates } from "@/server/campaigns/meta-templates";
import { checkPlaybookMomentInput } from "@/server/campaigns/playbooks";
import { fileStarterVersions, startersFiled, type StarterVersionResult } from "@/server/campaigns/template-versions";
import type { ZoneAndSettings } from "@/server/calendar/people-visits";
import { sellsByOf } from "@/server/people/deals";
import { appointmentWordFor } from "@/server/readers/facts";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

type Outcome = "submitted" | "exists" | "synced" | "failed" | "skipped";

/** A moment, as contracts triggerOf reads one. */
type Trigger = NonNullable<ReturnType<typeof triggerOf>>;

/** The language a new campaign's starter is filed in: English, as the composer's one press adds it. */
const STARTER_LANGUAGE = "en_US";

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
  const number = whatsapp && (await whatsappChannelFacts(ctx.supabase, tenantId)) !== null;
  return { whatsapp, number, own };
}

/** What the starter set is asked for: the starters by key, their languages, and the channels to write them on. */
interface StartersAsked {
  keys?: unknown;
  languages?: unknown;
  channels?: unknown;
}

/**
 * The set this workspace is offered (contracts startersOffered): the proposal follow-up only where deals are on, and the
 * review ask only where the Google listing keeps a review link (db reviewLinkOf, 00394), which its slot is filled from. A
 * link that could not be read is none here: the review ask is left out of a press, which costs nothing. A starter asked
 * for by its key and left out for want of the link is refused in the words a message's values are (core
 * TEMPLATE_VALUE_WORDS), never as "pick at least one".
 */
async function startersHere(ctx: RouteContext, tenantId: string, keys: unknown): Promise<StarterTemplate[]> {
  const [sellsBy, link] = await Promise.all([
    sellsByOf(ctx, tenantId),
    reviewLinkOf(ctx.supabase, tenantId).catch(() => null),
  ]);
  const dealsOn = dealsAreOn(sellsBy);
  const offered = startersOffered({ dealsOn, reviewLink: link !== null });
  const asked = Array.isArray(keys) ? keys : [];
  if (startersOffered({ dealsOn, reviewLink: true }).some((s) => asked.includes(s.key) && !offered.includes(s)))
    throw new AppError("conflict", TEMPLATE_VALUE_WORDS.noReviewLink, 409);
  return offered;
}

export async function addStarterTemplates(ctx: RouteContext, req: Request, member: Member) {
  return fileStarters(ctx, member.tenantId, ((await jsonBody(req)) as StartersAsked | null) ?? {});
}

/**
 * The starter set, filed for a workspace: the route's body (above), and a new campaign's one starter (withStarterMessage).
 * Everything the route did, with the workspace by its id. Not exported: only this module files starters.
 */
async function fileStarters(ctx: RouteContext, tenantId: string, body: StartersAsked) {
  const SAID: Record<string, string> = {
    preview: "Adding templates only works on the production dashboard.",
    no_channel: LIBRARY_WORDS.writeNeedsNumber,
    no_waba: "This number's WhatsApp Business Account is not on file. Reconnect the number and try again.",
    no_token: "Chanlytics has no access token for this number yet.",
  };
  // The set this workspace is offered: a starter it is not offered is not filed, asked for or not.
  const offered = await startersHere(ctx, tenantId, body.keys);
  const keys = Array.isArray(body.keys)
    ? body.keys.filter((k): k is string => typeof k === "string")
    : offered.map((s) => s.key);
  const languages = Array.isArray(body.languages)
    ? body.languages.filter((l): l is string => typeof l === "string")
    : [STARTER_LANGUAGE];
  const wanted = offered
    .filter((s) => keys.includes(s.key))
    .flatMap((s) => languages.filter((l) => !!s.texts[l]).map((l) => ({ s, l })));
  if (wanted.length === 0)
    throw new AppError("validation", "Pick at least one starter template, in English or Spanish.");
  const { whatsapp, number, own } = await starterChannelsOf(ctx, tenantId, body.channels);

  const rows = await templatesNamed(ctx.supabase, tenantId, [...new Set(wanted.map((w) => w.s.name))]);
  const onFile = (name: string, language: string) =>
    rows.find((r) => r.name === name && r.language === language) ?? null;

  // The email and text versions already here: a second click leaves each as it is.
  const filed = await startersFiled(ctx, tenantId, [...new Set(wanted.map((w) => w.s.name))]);
  // The email and text versions asked for: beside a WhatsApp version where there is one, else the first begins the message.
  const versionsOf = (s: StarterTemplate, l: string) => fileStarterVersions(ctx, tenantId, s, l, filed, own);

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
    const r = await createTemplate(tenantId, ctx.userId, {
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
        await syncTemplates(tenantId, ctx.userId);
        synced = true;
      }
      const now = await templateStatusOf(ctx.supabase, tenantId, s.name, l);
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

/* ---- A new campaign named by a starter (A0) ---- */

/** A new campaign's starter, filed: what became of its WhatsApp version, which the card's receipt says. Not exported. */
interface StarterFiled {
  key: string;
  status: Outcome;
  meta_status: string | null;
}

/** A starter card judged whole, before anything is filed (checkStarterPlaybook). */
interface StarterJudged {
  starter: StarterTemplate;
  /** Its slots, filled with the starter's own sources (contracts defaultParamSpecs, the starter's slots in English). */
  params: ParamSpec[];
  cls: PlaybookPolicyClass;
  /** The channels the campaign goes by: those named, or, named none, those held at once and WhatsApp where there is a number. */
  channels: ConsentChannel[];
  /** The starter's WhatsApp version on file now (in review, refused, approved), which the filing leaves as it is; or none. */
  whatsappOnFile: WhatsAppVersion | null;
  /** Its message as the filing leaves it (asFiled): what a card reads its channels against, as the drawer will read them. */
  message: PlaybookMessage;
}

/** A message's WhatsApp version, as contracts reads one. */
type WhatsAppVersion = NonNullable<PlaybookMessage["versions"]["whatsapp"]>;

/** The four whole numbers a campaign names, each held to its bounds before anything is filed. */
const NUMBERS = ["run_hour", "cap_per_run", "gap_days", "cadence_days"] as const;

/** A moment's name as a refusal says it: an appointment moment's in the workspace's own word (readers/facts.ts). */
async function momentLabel(ctx: RouteContext, tenantId: string, trig: Trigger): Promise<string> {
  return trig.kind === "visit"
    ? triggerWords(trig, appointmentWordFor(await sellsByOf(ctx, tenantId))).label
    : trig.label;
}

/**
 * The channels a starter's message holds the moment it is filed, of those its purpose may go by (contracts
 * channelNeverCarries): a version already on file that it holds (contracts messageHolds: WhatsApp's approved, an email's
 * or a text's), and the email and text versions the starter writes, which are filed at once. A WhatsApp version sent for
 * review holds nothing until WhatsApp approves it. With whether the workspace has a number to make one for, and whether
 * the WhatsApp version on file, where there is one, may yet send: one WhatsApp refused, paused or disabled, or one this
 * product cannot send whole, never will.
 */
async function heldAtOnce(ctx: RouteContext, tenantId: string, starter: StarterTemplate, purpose: AskedPurpose) {
  const [rows, line] = await Promise.all([
    messageVersionRowsOf(ctx.supabase, tenantId, { name: starter.name, language: STARTER_LANGUAGE }),
    whatsappChannelFacts(ctx.supabase, tenantId),
  ]);
  const onFile = campaignMessageOf(rows, starter.name, STARTER_LANGUAGE);
  const held = onFile ? messageHolds(onFile) : null;
  const writes = (c: ConsentChannel) =>
    c === "email"
      ? starterEmailText(starter, STARTER_LANGUAGE) !== null
      : c === "sms" && starterSmsText(starter, STARTER_LANGUAGE) !== null;
  const atOnce = CONSENT_CHANNELS.filter((c) => channelNeverCarries(c, purpose) === null && (held?.[c] || writes(c)));
  const wa = onFile?.versions.whatsapp ?? null;
  const whatsappMaySend = !wa || (wa.blocked === null && (wa.status === "approved" || wa.status === "pending"));
  return { atOnce, number: line !== null, whatsappMaySend, whatsapp: wa };
}

/**
 * The starter's message as its filing leaves it (fileStarters, for the campaign's `channels`), as the drawer will read
 * it (contracts playbookChannelsRead): an email and a text version where it holds them at once (on file, or written by
 * the filing); its WhatsApp version as it is on file, which the filing leaves as it is (in review, refused, approved);
 * else, where the campaign goes by WhatsApp and there is a number to make one for, the version the filing sends for
 * review, in review. The one reading of what a filing leaves, here where the filing is. No version the filing makes has
 * an id yet, and the reading reads none.
 */
function asFiled(
  starter: StarterTemplate,
  held: Awaited<ReturnType<typeof heldAtOnce>>,
  channels: readonly ConsentChannel[],
): PlaybookMessage {
  const own = (c: "email" | "sms") => (held.atOnce.includes(c) ? { id: "" } : null);
  const sent = channels.includes("whatsapp") && held.number;
  return {
    category: starter.category,
    versions: {
      whatsapp:
        held.whatsapp ?? (sent ? { id: "", status: "pending", hidden: false, blocked: null, reason: null } : null),
      email: own("email"),
      sms: own("sms"),
    },
  };
}

/**
 * The channels a starter's campaign goes by (checkStarterPlaybook): those named, else those its message holds at once and
 * WhatsApp where there is a number and its version may yet send, its people there held until WhatsApp approves it. Refused
 * where it would go by none its message holds at once: WhatsApp named where there is no number says a number is needed
 * (no approval is coming), and otherwise that it waits for WhatsApp, with where it could go at once.
 */
function starterChannels(
  title: string,
  named: ConsentChannel[] | null,
  held: Awaited<ReturnType<typeof heldAtOnce>>,
): ConsentChannel[] {
  const { atOnce, number, whatsappMaySend } = held;
  const channels =
    named ?? CONSENT_CHANNELS.filter((c) => atOnce.includes(c) || (c === "whatsapp" && number && whatsappMaySend));
  if (channels.length === 0) throw new AppError("validation", LIBRARY_STARTER_WORDS.pickAChannel);
  if (channels.some((c) => atOnce.includes(c))) return channels;
  if (channels.includes("whatsapp") && !number) throw new AppError("validation", LIBRARY_WORDS.writeNeedsNumber);
  const could = atOnce.filter((c) => !channels.includes(c));
  throw new AppError(
    "validation",
    LIBRARY_STARTER_WORDS.waitsForWhatsApp(title, channelsWords(channels), could.length ? channelsWords(could) : null),
  );
}

/**
 * A new campaign named by a starter, judged whole before anything is filed (the moment spec's A0, D23): a WhatsApp version
 * sent to Meta cannot be taken back, so every refusal the card could meet comes first, in the words a new campaign is
 * refused in. Its moment, list and class as a new campaign's (checkPlaybookMomentInput, core checkPlaybookMoment: the
 * moment offered here, contracts momentOffered); the starter is that moment's own and still offered, takes no words of its
 * own, and its kind of message fits the class (contracts messageFitsMoment); its numbers keep their bounds (core
 * playbookNumber); a channel it names is one its purpose carries (contracts channelNeverCarries). And it goes by a channel
 * its message holds at once (heldAtOnce): a WhatsApp version in review carries nothing until WhatsApp approves it, so a
 * campaign on that alone is refused and nothing is filed. Named none, it goes by the channels held at once and by WhatsApp
 * where there is a number, its people there held until WhatsApp approves, as a run holds the people on any channel not
 * ready yet. POST playbooks runs it before it files (withStarterMessage), and Ask's starter card runs it at the card
 * (act/playbook.ts proposeOnStarter): one judgement, in one set of words.
 */
export async function checkStarterPlaybook(
  ctx: RouteContext,
  tenantId: string,
  body: Record<string, unknown>,
  known?: ZoneAndSettings,
): Promise<StarterJudged> {
  const { trig, cls } = await checkPlaybookMomentInput(ctx, tenantId, body, known);
  // One proposal follow-up a workspace (00167 playbooks_one_follow_up): the index is the database's last word, said here
  // first, so a second's starter is never filed and nothing of it reaches Meta.
  if (trig.kind === "deal" && (await followUpOnFile(ctx.supabase, tenantId, trig.id)))
    throw new AppError("conflict", FOLLOW_UP_ONE, 409);
  const key = typeof body.starter_key === "string" ? body.starter_key : "";
  const starter = startersForTrigger(trig.id).find((s) => s.key === key && !s.retired);
  if (!starter)
    throw new AppError("validation", LIBRARY_STARTER_WORDS.notThisMoment(await momentLabel(ctx, tenantId, trig)));
  if (starterText(starter, STARTER_LANGUAGE).slots.some((s) => s.kind === "text"))
    throw new AppError("validation", LIBRARY_STARTER_WORDS.takesOwnWords(starter.title));
  const fit = messageFitsMoment(cls, starter.category);
  if (!fit.ok) throw new AppError("validation", fit.words);
  for (const k of NUMBERS) playbookNumber(k, body[k], PLAYBOOK_LIMITS[k].min);
  const params = defaultParamSpecs({ name: starter.name, variables: [] });
  // A booking-link slot needs a link on file, and a review-link slot the link the Google listing keeps, as a message's
  // values are held to them (core refuseWithoutBookingLink, refuseWithoutReviewLink).
  const values = templateValuePorts(ctx, tenantId);
  await refuseWithoutBookingLink(values, params);
  await refuseWithoutReviewLink(values, params);
  const purpose = enrolPurpose(cls, { category: starter.category });
  const named = body.channels === undefined || body.channels === null ? null : parseChannels(body.channels);
  const never = (named ?? []).map((c) => channelNeverCarries(c, purpose)).find((w) => w !== null);
  if (never) throw new AppError("validation", never);
  const held = await heldAtOnce(ctx, tenantId, starter, purpose);
  const channels = starterChannels(starter.title, named, held);
  return {
    starter,
    params,
    cls,
    channels,
    whatsappOnFile: held.whatsapp,
    message: asFiled(starter, held, channels),
  };
}

/**
 * A new campaign named by a starter's key and no message (Ask's first-day card, the moment spec's A0, D23): judged whole
 * first (checkStarterPlaybook: a refused card files nothing and asks nothing of Meta), then the starter is added as the
 * composer's one press adds it (fileStarters: in English, on the channels the campaign goes by), then the campaign goes by
 * that message, its slots filled with the starter's own sources. A starter that could not be filed so its message holds
 * one of those channels starts nothing (a version a database refused). A body with a message of its own, or with no key,
 * is the body as it came, and no starter is filed.
 */
export async function withStarterMessage(
  ctx: RouteContext,
  member: Member,
  asked: Record<string, unknown> | null,
): Promise<{ body: Record<string, unknown> | null; starter: StarterFiled | null }> {
  const key = typeof asked?.starter_key === "string" ? asked.starter_key : "";
  if (!asked || !key || (typeof asked.template_id === "string" && asked.template_id))
    return { body: asked, starter: null };
  const { starter_key: _key, ...rest } = asked;
  // Every check that could refuse the card, before anything is filed: nothing reaches Meta for a card that is refused.
  const judged = await checkStarterPlaybook(ctx, member.tenantId, asked);
  const filed = await fileStarters(ctx, member.tenantId, {
    keys: [key],
    languages: [STARTER_LANGUAGE],
    channels: judged.channels,
  });
  const result = filed.results.find((r) => r.key === key && r.language === STARTER_LANGUAGE) ?? null;
  const rows = await messageVersionRowsOf(ctx.supabase, member.tenantId, {
    name: judged.starter.name,
    language: STARTER_LANGUAGE,
  });
  const message = campaignMessageOf(rows, judged.starter.name, STARTER_LANGUAGE);
  const holds = message ? messageHolds(message) : null;
  if (!result || !message || !judged.channels.some((c) => holds?.[c])) {
    // Where its WhatsApp version did reach WhatsApp, that version is in the Library, in review, and the words say so.
    const reached = result?.status === "submitted" || result?.status === "synced";
    throw new AppError(
      "conflict",
      reached ? LIBRARY_STARTER_WORDS.notAddedSentForReview : LIBRARY_STARTER_WORDS.notAdded,
      409,
    );
  }
  return {
    body: { ...rest, template_id: message.anchor.id, params: judged.params, channels: judged.channels },
    starter: { key, status: result.status, meta_status: result.meta_status },
  };
}
