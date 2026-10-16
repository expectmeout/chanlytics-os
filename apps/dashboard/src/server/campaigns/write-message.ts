/**
 * A message written whole, filed as a starter is filed (POST /api/v1/templates/message, Ask's message card): one body
 * with every version (WhatsApp's, an email's, a text's) and the values they share, and one answer saying what became of
 * each. The route declares who may and how often; this is what it does.
 *
 * Everything that could refuse the message comes first, before anything is filed: a name of the shape Meta takes and no
 * starter's (a starter begins only as itself), a language from the list, at least one version, the values numbered in
 * order, no channel its purpose never goes by (a text carries no offer, contracts channelNeverCarries), no `utility`
 * category without a WhatsApp version for Meta to review (the check a member's first version meets, template-versions.ts
 * refuseWrittenUtility, in this door's own sentence: one about their own booking or proposal needs it), each version's
 * words on its channel's rules against the values (contracts validateOwnVersion, and validateTemplateDraft for
 * WhatsApp's, which Meta would refuse at the wire), and no twin: a message of the same name and language on file on any
 * channel is answered 409 in the words a WhatsApp submission is. A name on file in another language is a language of
 * that message, written beside it, and only as what it is held as (its category and its number of values, read once),
 * else 409 in words that say what is held. The three are exported (checkMessage, messageOnFile, heldValues): Ask's
 * message card makes each before it is a card (ask/tools/act/message.ts), so a card never promises what this refuses.
 *
 * Then the email and text versions are filed, at once and approved, through the doors a member's own are
 * (template-versions.ts fileWrittenVersion: the first begins the message with its category and values, the other is
 * written beside it), and WhatsApp's last, submitted to Meta for review as POST templates submits one
 * (template-submit.ts submitDraft). In that order, so a WhatsApp version the edge or Meta refuses leaves the others filed:
 * past the checks the answer always arrives, listing each version filed with its id and state, and the first that could
 * not be filed under `refused`, in its words, nothing after it attempted. A fault no one meant a person to read is said
 * in one plain sentence, and logged (message_version_not_filed).
 */
import {
  AppError,
  LIBRARY_STARTER_WORDS,
  MESSAGE_BEGIN_WORDS,
  OWN_VERSION_CHANNELS,
  TEMPLATE_LANGUAGES,
  TEMPLATE_NAME_WORDS,
  TEMPLATE_SAME_NAME_WORDS,
  channelNeverCarries,
  metaStatusOf,
  purposeOfTemplate,
  starterByName,
  templateNameOk,
  validateOwnVersion,
  validateTemplateDraft,
  type ConsentChannel,
  type OwnVersionChannel,
  type ParamSpec,
  type TemplateStatus,
} from "@chanlytics/contracts";
import { heldMessageOf, messageVersionRowsOf } from "@chanlytics/db";
import { submitDraft } from "@/server/campaigns/template-submit";
import { MESSAGE_VALUES_WORDS, fileWrittenVersion, refuseWrittenUtility } from "@/server/campaigns/template-versions";
import { log } from "@/server/log";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

/**
 * A message as it is written whole: its name and language, its kind, a version per channel, and the values they fill.
 * The route's schema is held to it (templates/message/route.ts), so this is the one statement of the body.
 */
export interface WriteMessageBody {
  name: string;
  language: string;
  category: "marketing" | "utility";
  versions: {
    whatsapp?: { body: string; footer?: string | undefined } | undefined;
    email?: { subject: string; body: string } | undefined;
    sms?: { body: string } | undefined;
  };
  /** Numbered 1, 2, 3 in order: the name a person sees for each, the example WhatsApp's reviewers read, and its source. */
  slots: Array<{ position: number; label: string; example?: string | undefined; kind: ParamSpec["kind"] }>;
}

/**
 * One version filed: an email's and a text's approved at once, WhatsApp's as Meta answered its filing (in review until
 * Meta says, or refused at once), read by the one rule a row's status is read by (contracts metaStatusOf).
 */
interface VersionFiled {
  channel: ConsentChannel;
  id: string;
  state: TemplateStatus;
}

/** What became of the message: each version filed, and the first that could not be, in its words. */
export interface WriteMessageAnswer {
  name: string;
  language: string;
  versions: VersionFiled[];
  refused?: { channel: ConsentChannel; words: string };
}

/** A version that could not be filed for a reason no one meant a person to read (a fault, not a refusal). */
const NOT_FILED = "This version could not be filed just now. Write it again from Messages.";

/**
 * The words a refusal says, or, for a fault, the plain sentence, the fault itself logged: the answer still arrives (the
 * versions before it are filed), so the route never sees it and its route_failed line is never written.
 */
function filingWords(e: unknown, tenantId: string, channel: ConsentChannel): string {
  if (e instanceof AppError && e.code !== "internal") return e.message;
  log.error("message_version_not_filed", { tenant_id: tenantId, channel, error: e });
  return NOT_FILED;
}

/** An email's or a text's words as the body says them; null where it has no version on that channel. */
function ownWords(versions: WriteMessageBody["versions"], channel: OwnVersionChannel) {
  if (channel === "email")
    return versions.email ? { subject: versions.email.subject, body: versions.email.body } : null;
  return versions.sms ? { subject: null, body: versions.sms.body } : null;
}

/** The channels the body writes a version for, in the order they are filed: email, text, then WhatsApp. */
function channelsWritten(versions: WriteMessageBody["versions"]): ConsentChannel[] {
  const own = OWN_VERSION_CHANNELS.filter((c) => ownWords(versions, c) !== null);
  return versions.whatsapp ? [...own, "whatsapp"] : own;
}

/** WhatsApp's version as Meta's review takes it: its body and footer, each value's example and name, in order. */
function whatsappDraft(body: WriteMessageBody, slots: WriteMessageBody["slots"]) {
  return {
    name: body.name,
    language: body.language,
    category: body.category,
    body: body.versions.whatsapp?.body ?? "",
    footer: body.versions.whatsapp?.footer ?? null,
    examples: slots.map((s) => s.example ?? ""),
    labels: slots.map((s) => s.label),
  };
}

/** The values in the order of their positions: what every check and the filing read. */
const slotsOf = (body: WriteMessageBody): WriteMessageBody["slots"] =>
  [...body.slots].sort((a, b) => a.position - b.position);

/** Every refusal of the message's own words, before anything is filed, in the person's words (400). */
export function checkMessage(body: WriteMessageBody): void {
  const slots = slotsOf(body);
  const refuse = (words: string) => {
    throw new AppError("validation", words);
  };
  if (!templateNameOk(body.name)) refuse(TEMPLATE_NAME_WORDS);
  if (starterByName(body.name)) refuse(MESSAGE_BEGIN_WORDS.starterNeedsItsOwnWords);
  if (!TEMPLATE_LANGUAGES.some((l) => l.id === body.language)) refuse("Pick a language from the list.");
  const channels = channelsWritten(body.versions);
  if (channels.length === 0) refuse(LIBRARY_STARTER_WORDS.pickAChannel);
  if (slots.some((s, i) => s.position !== i + 1 || !s.label.trim())) refuse(MESSAGE_VALUES_WORDS);
  const purpose = purposeOfTemplate(body.category);
  const never = channels.map((c) => channelNeverCarries(c, purpose)).find((w) => w !== null);
  if (never) refuse(never);
  // Nobody reviews a category its writer declares: utility comes with a WhatsApp version Meta reviews, or not at all,
  // said as this door takes it (one about their own booking or proposal needs that version).
  if (!body.versions.whatsapp) refuseWrittenUtility(body.category, MESSAGE_BEGIN_WORDS.utilityNeedsWhatsapp);
  for (const channel of OWN_VERSION_CHANNELS) {
    const words = ownWords(body.versions, channel);
    const check = words ? validateOwnVersion(channel, words, slots.length, body.language) : null;
    if (check && !check.ok) refuse(check.error);
  }
  if (body.versions.whatsapp) {
    const check = validateTemplateDraft({ ...whatsappDraft(body, slots), button: null });
    if (!check.ok) refuse(check.error);
  }
}

/**
 * A twin: whether the workspace holds the message already, its name in its language, on any channel. The door answers it
 * 409 (TEMPLATE_SAME_NAME_WORDS); its other versions are written in the Library.
 */
export async function messageOnFile(
  ctx: RouteContext,
  tenantId: string,
  body: Pick<WriteMessageBody, "name" | "language">,
): Promise<boolean> {
  return (await messageVersionRowsOf(ctx.supabase, tenantId, { name: body.name, language: body.language })).length > 0;
}

/**
 * The message on file under this name in another language, read once before anything is filed: a language of a message
 * is the same kind of message with the same values, so one said otherwise is refused (409) in words that say what is
 * held. Its kind is what a send judges it by (consent purposeOfTemplate, the one spelling: a row filed with no category
 * is an offer), so a held row with none takes an offer beside it. A code for signing in (`authentication`) is no kind a
 * campaign sends, and is refused in words of its own. What it answers is how many values the versions are written
 * beside, or null where the name begins a message.
 */
export async function heldValues(ctx: RouteContext, tenantId: string, body: WriteMessageBody): Promise<number | null> {
  const held = await heldMessageOf(ctx.supabase, tenantId, body.name, body.language);
  if (!held) return null;
  if (held.category === "authentication") throw new AppError("conflict", MESSAGE_BEGIN_WORDS.heldAuthentication, 409);
  const purpose = purposeOfTemplate(held.category);
  if (purpose !== purposeOfTemplate(body.category) || held.slots !== body.slots.length)
    throw new AppError("conflict", MESSAGE_BEGIN_WORDS.heldOtherwise(purpose, held.slots), 409);
  return held.slots;
}

export async function writeMessage(
  ctx: RouteContext,
  member: Member,
  body: WriteMessageBody,
): Promise<WriteMessageAnswer> {
  const { name, language, category } = body;
  const slots = slotsOf(body);
  checkMessage(body);
  if (await messageOnFile(ctx, member.tenantId, body)) throw new AppError("conflict", TEMPLATE_SAME_NAME_WORDS, 409);
  // A language of a message held in another: written beside it, as what it is held as.
  let held = await heldValues(ctx, member.tenantId, body);

  const filed: VersionFiled[] = [];
  const answer = (refused?: WriteMessageAnswer["refused"]): WriteMessageAnswer => ({
    name,
    language,
    versions: filed,
    ...(refused ? { refused } : {}),
  });
  const variables = slots.map((s) => ({ position: s.position, label: s.label, example: s.example ?? null }));
  for (const channel of OWN_VERSION_CHANNELS) {
    const words = ownWords(body.versions, channel);
    if (!words) continue;
    try {
      const v = { name, language, channel, ...words };
      const saved = await fileWrittenVersion(ctx, member.tenantId, v, held, { category, variables });
      // The message is held from its first version on: the next is written beside it.
      held = slots.length;
      filed.push({ channel, id: saved.version.id, state: "approved" });
    } catch (e) {
      return answer({ channel, words: filingWords(e, member.tenantId, channel) });
    }
  }
  if (!body.versions.whatsapp) return answer();
  try {
    const sent = await submitDraft(ctx, member, whatsappDraft(body, slots));
    // As Meta answered: a version it refused in its create answer is filed refused, never said to be in review.
    filed.push({ channel: "whatsapp", id: sent.id, state: metaStatusOf(sent.meta_status) });
    return answer();
  } catch (e) {
    return answer({ channel: "whatsapp", words: filingWords(e, member.tenantId, "whatsapp") });
  }
}
