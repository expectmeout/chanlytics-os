/**
 * The starter set, added to a workspace (POST /api/v1/templates/starter): { keys?, languages?, channels? }, every starter
 * the workspace is offered by default (contracts startersOffered: the proposal follow-up's in every workspace,
 * 0006, and the review ask's only where the Google listing keeps a review link, 00415), in English by default, on every
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
import { randomUUID } from "node:crypto";
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
  defaultParamSpecs,
  enrolPurpose,
  messageFitsMoment,
  messageGoesBy,
  messageHolds,
  starterByKey,
  startersForTrigger,
  startersOffered,
  parseTenantConfig,
  starterDraft,
  starterText,
  templateComponents,
  momentNamesVisit,
  purposeOfTemplate,
  whatsappOffersOpen,
  triggerWords,
  validateTemplateDraft,
  type AskedPurpose,
  type CampaignMessage,
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
  refuseMessageNoTickHolds,
  refuseWithoutBookingLink,
  refuseWithoutReviewLink,
} from "@chanlytics/core";
import {
  followUpOnFile,
  listMessageVersionRows,
  reviewLinkOf,
  findTemplateStatus,
  listTemplatesNamed,
  findWhatsappChannelFacts,
  type MessageVersionRow,
} from "@chanlytics/db/campaigns";
import { logAndGoOn } from "@chanlytics/log";
import { templateValuePorts } from "@/server/campaigns/ports";
import { getStoredConfig } from "@/server/workspace/config-row";
import { profileLanguagesOf, starterLanguageOf } from "@/lib/starter-message";
import { whatsappWrittenHere } from "@/server/campaigns/write-message";
import { readJsonBody } from "@/server/shared/request-guards";
import { createTemplate, syncTemplates } from "@/server/campaigns/meta-templates";
import { checkPlaybookMomentInput } from "@/server/campaigns/playbooks";
import { fileStarterVersions, getStartersFiled, type StarterVersionResult } from "@/server/campaigns/template-versions";
import type { ZoneAndSettings } from "@/server/calendar/people-visits";
import { getAppointmentWord } from "@/server/people/deals";
import type { RouteContext } from "@/server/shared/with-route";
import type { Member } from "@/server/shared/route";
import { WHATSAPP_ACCOUNT_MISSING, WHATSAPP_NO_TOKEN } from "@/server/campaigns/whatsapp-refusals";
import type { TenantId } from "@chanlytics/contracts";

type Outcome = "submitted" | "exists" | "synced" | "failed" | "skipped";

/** A moment, as contracts triggerOf reads one. */
type Trigger = NonNullable<ReturnType<typeof triggerOf>>;

/** A body that names no starter of the set this workspace is offered. */
const PICK_A_STARTER = "Pick at least one starter template, in English or Spanish.";

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
async function starterChannelsOf(ctx: RouteContext, tenantId: TenantId, value: unknown) {
  const named = Array.isArray(value)
    ? value.filter((c): c is ConsentChannel => CONSENT_CHANNELS.some((x) => x === c))
    : null;
  if (named && named.length === 0) throw new AppError("validation", LIBRARY_STARTER_WORDS.pickAChannel);
  const whatsapp = named ? named.includes("whatsapp") : true;
  const own: OwnVersionChannel[] = OWN_VERSION_CHANNELS.filter((c) => (named ? named.includes(c) : true));
  const line = whatsapp ? await findWhatsappChannelFacts(ctx.supabase, tenantId) : null;
  // Whether offers can go by WhatsApp from that number: an offer starter is never written there where they cannot.
  return { whatsapp, number: line !== null, own, offers: line ? whatsappOffersOpen(line.number) : null };
}

/** What the starter set is asked for: the starters by key, their languages, and the channels to write them on. */
interface StartersAsked {
  keys?: unknown;
  languages?: unknown;
  channels?: unknown;
}

/**
 * The set this workspace is offered (contracts startersOffered): every starter, the proposal follow-up's too (0008,
 * amended 18 Oct 2026), and the review ask only where the Google listing keeps a review link (db reviewLinkOf, 00415),
 * which its slot is filled from. A link that could not be read is none here: the review ask is left out of a press,
 * which costs nothing. A starter asked for by its key and left out for want of the link is refused in the words a
 * message's values are (core TEMPLATE_VALUE_WORDS), never as "pick at least one".
 */
async function startersHere(ctx: RouteContext, tenantId: TenantId, keys: unknown): Promise<StarterTemplate[]> {
  const link = await reviewLinkOf(ctx.supabase, tenantId).catch(() => null);
  const offered = startersOffered({ reviewLink: link !== null });
  const keyList = Array.isArray(keys) ? keys : [];
  if (startersOffered({ reviewLink: true }).some((s) => keyList.includes(s.key) && !offered.includes(s)))
    throw new AppError("conflict", TEMPLATE_VALUE_WORDS.noReviewLink, 409);
  return offered;
}

/**
 * The language a starter is filed in here (lib/starter-message.ts starterLanguageOf): its customers', by the languages the business's
 * profile says it answers in, as New and the step editor show it. A profile that could not be read names none: English.
 */
async function starterLanguageHere(ctx: RouteContext, tenantId: TenantId, starter: StarterTemplate): Promise<string> {
  const config = await getStoredConfig(ctx.supabase, tenantId)
    .then(parseTenantConfig)
    .catch(logAndGoOn("starter language", null));
  return starterLanguageOf(starter, profileLanguagesOf(config));
}

/**
 * POST templates/starter: starters filed as a use of them asks (the clean list, 14 Nov 2026): a sequence's step editor
 * files the one it picked, on the sequence's channels, as its Save is pressed. No page adds the set, nor a starter by
 * itself: a starter is ready to use as it is, and goes to WhatsApp for review the first time something sends it (or, for
 * one already in use, as a number connects: fileStartersWhatsAppOnConnect). Asked for one starter in one language, the
 * answer names the version a step sends (`template_id`, its message's anchor; null where nothing of it is on file).
 */
export async function addStarterTemplates(ctx: RouteContext, req: Request, member: Member) {
  const filed = await fileStarters(ctx, member.tenantId, ((await readJsonBody(req)) as StartersAsked | null) ?? {});
  const [only] = filed.results;
  const starter = filed.results.length === 1 && only ? starterByKey(only.key) : null;
  if (!only || !starter) return { ...filed, template_id: null };
  const rows = await listMessageVersionRows(ctx.supabase, member.tenantId, {
    name: starter.name,
    language: only.language,
  });
  return { ...filed, template_id: campaignMessageOf(rows, starter.name, only.language)?.anchor.id ?? null };
}

/**
 * Starters filed for a workspace: the route's body (above), a new campaign's one starter (withStarterMessage) and a step's
 * (fileStarterForUse). Everything the route did, with the workspace by its id. Not exported: only this module files
 * starters.
 */
async function fileStarters(ctx: RouteContext, tenantId: TenantId, body: StartersAsked) {
  const SAID: Record<string, string> = {
    preview: "Adding templates only works on the production dashboard.",
    no_channel: LIBRARY_WORDS.writeNeedsNumber,
    no_waba: WHATSAPP_ACCOUNT_MISSING,
    no_token: WHATSAPP_NO_TOKEN,
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
  if (wanted.length === 0) throw new AppError("validation", PICK_A_STARTER);
  const { whatsapp, number, own, offers } = await starterChannelsOf(ctx, tenantId, body.channels);

  const rows = await listTemplatesNamed(ctx.supabase, tenantId, [...new Set(wanted.map((w) => w.s.name))]);
  const onFile = (name: string, language: string) =>
    rows.find((r) => r.name === name && r.language === language) ?? null;

  // The email and text versions already here: a second click leaves each as it is.
  const filed = await getStartersFiled(ctx, tenantId, [...new Set(wanted.map((w) => w.s.name))]);
  // The email and text versions asked for: beside a WhatsApp version where there is one, else the first begins the message.
  const versionsOf = (s: StarterTemplate, l: string) => fileStarterVersions(ctx, tenantId, s, l, filed, own);

  const results: StarterResult[] = [];
  let synced = false;
  // WhatsApp asked for and no number to make its version for: said on each starter skipped, never thrown.
  const noNumber = whatsapp && !number ? { detail: SAID.no_channel } : {};
  for (const { s, l } of wanted) {
    const base = { key: s.key, title: s.title, language: l };
    const have = onFile(s.name, l);
    if (have) {
      results.push({ ...base, status: "exists", meta_status: have.meta_status, versions: await versionsOf(s, l) });
      continue;
    }
    if (!whatsapp || !number || !whatsappWrittenHere(s.category, offers)) {
      // No WhatsApp version is made: it was not asked for, there is no number to make it for (said, where it was asked
      // for), or it is an offer and no offer reaches anyone by WhatsApp from this number (a US one: not said, since nothing
      // of it is the owner's to do, write-message.ts whatsappWrittenHere). Never thrown: the email and text are written.
      results.push({
        ...base,
        status: "skipped",
        meta_status: null,
        ...noNumber,
        versions: await versionsOf(s, l),
      });
      continue;
    }
    const check = validateTemplateDraft(starterDraft(s, l));
    if (!check.ok) {
      results.push({ ...base, status: "failed", meta_status: null, detail: check.error, versions: [] });
      continue;
    }
    const value = check.value;
    const template = await createTemplate(tenantId, ctx.userId, {
      name: value.name,
      language: value.language,
      category: value.category,
      components: templateComponents(value),
      body: value.body,
      examples: value.examples,
      labels: starterText(s, l).slots.map((x) => x.label),
    });
    if (template.ok) {
      results.push({
        ...base,
        status: "submitted",
        meta_status: template.metaStatus,
        versions: await versionsOf(s, l),
      });
      continue;
    }
    if (template.reason === "meta_refused" && ALREADY_AT_META.test(template.detail ?? "")) {
      // The number's account already holds it: bring it here instead of refusing.
      if (!synced) {
        await syncTemplates(tenantId, ctx.userId);
        synced = true;
      }
      const now = await findTemplateStatus(ctx.supabase, tenantId, s.name, l);
      results.push(
        now
          ? { ...base, status: "synced", meta_status: now.meta_status, versions: await versionsOf(s, l) }
          : { ...base, status: "failed", meta_status: null, detail: template.detail, versions: [] },
      );
      continue;
    }
    if (template.reason === "no_channel") {
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
    if (template.reason in SAID) {
      // Nothing can be added at all: say so once, as the submit route does --
      // but only while nothing HAS been added. Past the first submission the
      // templates already at Meta are real and in review, and throwing here
      // discarded `results` entirely, so the owner was told nothing was added
      // while several sat waiting for Meta under their account.
      const done = results.some((x) => x.status === "submitted" || x.status === "synced");
      if (!done) {
        throw new AppError(
          template.reason === "preview" || template.reason === "no_token" ? "upstream_meta" : "conflict",
          SAID[template.reason] ?? template.reason,
          template.reason === "preview" || template.reason === "no_token" ? 502 : 409,
        );
      }
      results.push({ ...base, status: "failed", meta_status: null, detail: SAID[template.reason], versions: [] });
      break;
    }
    results.push({
      ...base,
      status: "failed",
      meta_status: null,
      detail: template.detail ?? template.reason,
      versions: [],
    });
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
  /** The language it is filed in here (starterLanguageHere), which what is on file is read in too. */
  language: string;
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
async function momentLabel(ctx: RouteContext, tenantId: TenantId, trig: Trigger): Promise<string> {
  return momentNamesVisit(trig.id) ? triggerWords(trig, await getAppointmentWord(ctx, tenantId)).label : trig.label;
}

/**
 * The channels a starter's message holds the moment it is filed, of those its purpose may go by (contracts
 * channelNeverCarries): a version already on file that it holds (contracts messageHolds: WhatsApp's approved, an email's
 * or a text's), and the email and text versions the starter writes, which are filed at once. A WhatsApp version sent for
 * review holds nothing until WhatsApp approves it. With whether the workspace has a number to make one for, and whether
 * the WhatsApp version on file, where there is one, may yet send: one WhatsApp refused, paused or disabled, or one this
 * product cannot send whole, never will.
 */
async function heldAtOnce(
  ctx: RouteContext,
  tenantId: TenantId,
  starter: StarterTemplate,
  on: { purpose: AskedPurpose; language: string },
) {
  const { purpose, language } = on;
  const [rows, line] = await Promise.all([
    listMessageVersionRows(ctx.supabase, tenantId, { name: starter.name, language }),
    findWhatsappChannelFacts(ctx.supabase, tenantId),
  ]);
  const onFile = campaignMessageOf(rows, starter.name, language);
  const held = onFile ? messageHolds(onFile) : null;
  // What the filing writes at once, in this language exactly (template-versions.ts starterWords): no English stand-in.
  const writes = (c: ConsentChannel) =>
    c === "email" ? !!starter.email?.[language] : c === "sms" && !!starter.sms?.[language];
  const atOnce = CONSENT_CHANNELS.filter((c) => channelNeverCarries(c, purpose) === null && (held?.[c] || writes(c)));
  const wa = onFile?.versions.whatsapp ?? null;
  const whatsappMaySend = !wa || (wa.blocked === null && (wa.status === "approved" || wa.status === "pending"));
  // An offer starter is never written for WhatsApp where no offer reaches anyone by it (a US number).
  const offers = line ? whatsappOffersOpen(line.number) : null;
  const written = whatsappWrittenHere(starter.category, offers);
  return {
    atOnce,
    number: line !== null,
    whatsappMaySend,
    whatsapp: wa,
    whatsappWritten: written,
    whatsappOffers: offers,
  };
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
 * WhatsApp where there is a number and its version may yet send, its people there held until WhatsApp approves it. It is
 * a campaign where its message, as the filing leaves it (asFiled), goes by one of them, by the rule a campaign on a
 * message on file is held to (core refuseMessageNoTickHolds over contracts messageGoesBy, the one picker rule): a channel
 * it holds at once, or WhatsApp while WhatsApp checks its words, the campaign's people waiting for that check as a
 * sequence picked in New waits (core paced.ts). By WhatsApp alone it was refused until WhatsApp approved the version, and
 * nothing could be started. Refused where it goes by none: WhatsApp named where there is no number says a number is
 * needed (no approval is coming), and otherwise each channel says why not in the message's own sentence for it (a version
 * WhatsApp asked a change to, a text the starter has none of).
 */
function starterChannels(
  starter: StarterTemplate,
  named: ConsentChannel[] | null,
  held: Awaited<ReturnType<typeof heldAtOnce>>,
): ConsentChannel[] {
  const { atOnce, number, whatsappMaySend, whatsappWritten } = held;
  const channels =
    named ??
    CONSENT_CHANNELS.filter(
      (c) => atOnce.includes(c) || (c === "whatsapp" && number && whatsappMaySend && whatsappWritten),
    );
  if (channels.length === 0) throw new AppError("validation", LIBRARY_STARTER_WORDS.pickAChannel);
  if (channels.some((c) => atOnce.includes(c))) return channels;
  if (channels.includes("whatsapp") && !number) throw new AppError("validation", LIBRARY_WORDS.writeNeedsNumber);
  refuseMessageNoTickHolds(asFiled(starter, held, channels), channels);
  return channels;
}

/**
 * A new campaign named by a starter, judged whole before anything is filed (the moment spec's A0, D23): a WhatsApp version
 * sent to Meta cannot be taken back, so every refusal the card could meet comes first, in the words a new campaign is
 * refused in. Its moment, list and class as a new campaign's (checkPlaybookMomentInput, core checkPlaybookMoment: the
 * moment offered here, contracts momentOffered); the starter is that moment's own and still offered, takes no words of its
 * own, and its kind of message fits the class (contracts messageFitsMoment); its numbers keep their bounds (core
 * playbookNumber); a channel it names is one its purpose carries (contracts channelNeverCarries). And it goes by a channel
 * its message goes by once filed (starterChannels): one it holds at once, or WhatsApp while WhatsApp checks its words, its
 * people there held until WhatsApp approves, as a run holds the people on any channel not ready yet. Named none, it goes
 * by the channels held at once and by WhatsApp where there is a number. POST playbooks runs it before it files
 * (withStarterMessage), and Ask's starter card runs it at the card
 * (act/playbook/playbook.ts proposeOnStarter): one judgement, in one set of words.
 */
export async function checkStarterPlaybook(
  ctx: RouteContext,
  tenantId: TenantId,
  body: Record<string, unknown>,
  known?: ZoneAndSettings,
): Promise<StarterJudged> {
  const { trig, cls } = await checkPlaybookMomentInput(ctx, tenantId, body, known);
  // One proposal follow-up a workspace (00167, sequence_steps_one_follow_up): the index is the database's last word, said here
  // first, so a second's starter is never filed and nothing of it reaches Meta.
  if (trig.kind === "deal" && (await followUpOnFile(ctx.supabase, tenantId, trig.id)))
    throw new AppError("conflict", FOLLOW_UP_ONE, 409);
  const key = typeof body.starter_key === "string" ? body.starter_key : "";
  const starter = startersForTrigger(trig.id).find((s) => s.key === key && !s.retired);
  if (!starter)
    throw new AppError("validation", LIBRARY_STARTER_WORDS.notThisMoment(await momentLabel(ctx, tenantId, trig)));
  const language = await starterLanguageHere(ctx, tenantId, starter);
  if (starterText(starter, language).slots.some((s) => s.kind === "text"))
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
  const held = await heldAtOnce(ctx, tenantId, starter, { purpose, language });
  // WhatsApp named for an offer no one here can be sent by it (a US number): refused in the pause's own words.
  if (named?.includes("whatsapp") && !held.whatsappWritten && held.whatsappOffers?.why)
    throw new AppError("validation", held.whatsappOffers.why, undefined, { mend: null });
  const channels = starterChannels(starter, named, held);
  return {
    starter,
    params,
    language,
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
 * that message, its slots filled with the starter's own sources. A starter that could not be filed so its message
 * carries the campaign as it was judged (filedCarries) starts nothing (a version a database refused). A body with a
 * message of its own, or with no key, is the body as it came, and no starter is filed.
 */
export async function withStarterMessage(
  ctx: RouteContext,
  member: Member,
  record: Record<string, unknown> | null,
): Promise<{ body: Record<string, unknown> | null; starter: StarterFiled | null }> {
  const key = typeof record?.starter_key === "string" ? record.starter_key : "";
  if (!record || !key || (typeof record.template_id === "string" && record.template_id))
    return { body: record, starter: null };
  const { starter_key: _key, ...rest } = record;
  // Every check that could refuse the card, before anything is filed: nothing reaches Meta for a card that is refused.
  const judged = await checkStarterPlaybook(ctx, member.tenantId, record);
  const { result, message } = await filedForUse(ctx, member.tenantId, judged.starter, {
    channels: judged.channels,
    language: judged.language,
  });
  if (!result || !message || !filedCarries(judged, message)) throw notFiled(result);
  return {
    body: { ...rest, template_id: message.anchor.id, params: judged.params, channels: judged.channels },
    starter: { key, status: result.status, meta_status: result.meta_status },
  };
}

/**
 * Whether the filing left the starter's message able to carry the campaign as it was judged. Judged on a channel its
 * message holds at once (its email, its text, a WhatsApp version already approved), it starts where the filing left one
 * of those held: a version a database refused starts nothing, though its WhatsApp version is with WhatsApp. Judged on
 * WhatsApp's check alone (starterChannels), it starts where that version is with WhatsApp, being checked.
 */
function filedCarries(judged: StarterJudged, message: Pick<CampaignMessage, "versions">): boolean {
  const held = (m: Pick<CampaignMessage, "versions">) => judged.channels.filter((c) => messageHolds(m)[c]);
  if (held(judged.message).length > 0) return held(message).length > 0;
  return judged.channels.some((c) => messageGoesBy(message).includes(c));
}

/* ---- A starter filed the first time something uses it ---- */

/**
 * One starter filed in its language here (starterLanguageHere) on the channels a use goes by (fileStarters), and its
 * message as the filing left it, read back (null where no version of it is on file).
 */
async function filedForUse(
  ctx: RouteContext,
  tenantId: TenantId,
  starter: StarterTemplate,
  use: { channels: readonly ConsentChannel[]; language: string },
) {
  const { channels, language } = use;
  const filed = await fileStarters(ctx, tenantId, { keys: [starter.key], languages: [language], channels });
  const result = filed.results.find((r) => r.key === starter.key && r.language === language) ?? null;
  const rows = await listMessageVersionRows(ctx.supabase, tenantId, { name: starter.name, language });
  return { result, message: campaignMessageOf(rows, starter.name, language) };
}

/**
 * A filing that left nothing to send a starter by: where its WhatsApp version did reach WhatsApp, that version is in
 * Messages, in review, and the words say so.
 */
function notFiled(result: StarterResult | null): AppError {
  const reached = result?.status === "submitted" || result?.status === "synced";
  return new AppError(
    "conflict",
    reached ? LIBRARY_STARTER_WORDS.notAddedSentForReview : LIBRARY_STARTER_WORDS.notAdded,
    409,
  );
}

/**
 * A starter filed the first time something uses it (the clean list, 14 Nov 2026): a step of New's draft, as the draft is
 * kept or started (drafts/sequence-new.ts). In its customers' language (starterLanguageHere, as New showed it), on the
 * channels the draft goes by: its email and text versions at
 * once, and its WhatsApp version sent to WhatsApp for review where those hold WhatsApp and there is a number, the run that
 * sends it waiting for the answer as a run waits for any version in review. Answers the version a step names (the
 * message's anchor). A key that is no starter of the set is refused as a pick of none; a filing that left no version on
 * file, in the words a new campaign's starter is.
 */
export async function fileStarterForUse(
  ctx: RouteContext,
  tenantId: TenantId,
  key: string,
  channels: readonly ConsentChannel[],
): Promise<string> {
  const starter = starterByKey(key);
  if (!starter) throw new AppError("validation", PICK_A_STARTER);
  const language = await starterLanguageHere(ctx, tenantId, starter);
  const { result, message } = await filedForUse(ctx, tenantId, starter, { channels, language });
  if (!result || !message) throw notFiled(result);
  return message.anchor.id;
}

/**
 * A starter as its filing for a use will leave it (fileStarterForUse, on `channels`), before anything is filed: the rows of
 * its message as the judgement of a sequence reads one (the one picker rule's message, read by id), in its language here,
 * its versions those asFiled reads (on file, written at once, or sent to WhatsApp for review), its values the starter's
 * own slots. New judges a sequence whole against these first (drafts/sequence-new.ts): a WhatsApp version sent for
 * review cannot be taken back, so nothing is filed for a sequence that would be refused (the review of 15 Nov 2026, C6).
 * Null where the key is no starter of the set, which the filing refuses in its own words.
 */
export async function findStarterStandIn(
  ctx: RouteContext,
  tenantId: TenantId,
  key: string,
  channels: readonly ConsentChannel[],
): Promise<MessageVersionRow[] | null> {
  const starter = starterByKey(key);
  if (!starter) return null;
  const language = await starterLanguageHere(ctx, tenantId, starter);
  const held = await heldAtOnce(ctx, tenantId, starter, { purpose: purposeOfTemplate(starter.category), language });
  const { versions } = asFiled(starter, held, channels);
  // Its values as its filing's are: the starter's own slots (the same count New's draft and the AI's card fill).
  const variables = defaultParamSpecs({ name: starter.name, variables: [] }).map((_, i) => ({ position: i + 1 }));
  const row = (channel: ConsentChannel, status: string, blocked: string | null) => ({
    id: randomUUID(),
    channel,
    name: starter.name,
    language,
    meta_status: status,
    category: starter.category,
    variables,
    hidden_at: null,
    title: starter.title,
    source: "chanlytics",
    components: null,
    body_preview: starterText(starter, language).body,
    rejected_reason: null,
    blocked,
  });
  return [
    ...(versions.whatsapp ? [row("whatsapp", versions.whatsapp.status, versions.whatsapp.blocked)] : []),
    ...(versions.email ? [row("email", "approved", null)] : []),
    ...(versions.sms ? [row("sms", "approved", null)] : []),
  ];
}

/**
 * A number connected after starters went into use (the review of 15 Nov 2026): each starter on file by email or text
 * alone gets its WhatsApp version, in each language it is on file in, sent for review, as one filed with a number would
 * have had. Nothing else of the set is filed, an offer from a number Meta's pause holds gets none (fileStarters), and one
 * whose WhatsApp version is on file is left as it is. The connect route runs it once its own answer has gone; a failure
 * stops nothing, and the starter's WhatsApp version is then filed the next time a use asks for it.
 */
export async function fileStartersWhatsAppOnConnect(ctx: RouteContext, tenantId: TenantId): Promise<void> {
  const offered = await startersHere(ctx, tenantId, []);
  const own = await getStartersFiled(
    ctx,
    tenantId,
    offered.map((s) => s.name),
  );
  const byLanguage = new Map<string, Set<string>>();
  for (const filed of own) {
    const [, name, language] = filed.split("|");
    const starter = offered.find((s) => s.name === name);
    if (!starter || !language || !starter.texts[language]) continue;
    byLanguage.set(language, (byLanguage.get(language) ?? new Set()).add(starter.key));
  }
  for (const [language, keys] of byLanguage)
    await fileStarters(ctx, tenantId, { keys: [...keys], languages: [language], channels: ["whatsapp"] });
}
