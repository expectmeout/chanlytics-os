/**
 * A message written whole, filed as a starter is filed (POST /api/v1/templates/message, Ask's message card): one body
 * with every version (WhatsApp's, an email's, a text's) and the values they share, and one answer saying what became of
 * each. The route declares who may and how often; this is what it does.
 *
 * Everything that could refuse the message comes first, before anything is filed: a name of the shape Meta takes and no
 * starter's (a starter begins only as itself), a language from the list, at least one version, the values numbered in
 * order, no channel its purpose never goes by (a text carries no offer, contracts channelNeverCarries), each version's
 * words on its channel's rules against the values (contracts validateOwnVersion, and validateTemplateDraft for
 * WhatsApp's, which Meta would refuse at the wire), and no twin: a message of the same name and language on file on any
 * channel is answered 409 in the words a WhatsApp submission is.
 *
 * Then the email and text versions are filed, at once and approved, through the doors a member's own are
 * (template-versions.ts fileWrittenVersion: the first begins the message with its category and values, the other is
 * written beside it), and WhatsApp's last, submitted to Meta for review as POST templates submits one
 * (template-submit.ts submitDraft). In that order, so a WhatsApp version the edge or Meta refuses leaves the others filed:
 * past the checks the answer always arrives, listing each version filed with its id and state, and the first that could
 * not be filed under `refused`, in its words, nothing after it attempted. A fault no one meant a person to read is said
 * in one plain sentence.
 */
import {
  AppError,
  LIBRARY_STARTER_WORDS,
  MESSAGE_BEGIN_WORDS,
  OWN_VERSION_CHANNELS,
  TEMPLATE_LANGUAGES,
  TEMPLATE_NAME_WORDS,
  channelNeverCarries,
  purposeOfTemplate,
  starterByName,
  templateNameOk,
  validateOwnVersion,
  validateTemplateDraft,
  type ConsentChannel,
  type OwnVersionChannel,
  type ParamSpec,
} from "@chanlytics/contracts";
import { messageVersionRowsOf } from "@chanlytics/db";
import { SAME_NAME_WORDS, submitDraft } from "@/server/campaigns/template-submit";
import { MESSAGE_VALUES_WORDS, fileWrittenVersion } from "@/server/campaigns/template-versions";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

/** A message as it is written whole: its name and language, its kind, a version per channel, and the values they fill. */
interface WriteMessageBody {
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

/** One version filed: an email's and a text's approved at once, WhatsApp's in review until Meta says. */
interface VersionFiled {
  channel: ConsentChannel;
  id: string;
  state: "approved" | "pending";
}

/** What became of the message: each version filed, and the first that could not be, in its words. */
interface WriteMessageAnswer {
  name: string;
  language: string;
  versions: VersionFiled[];
  refused?: { channel: ConsentChannel; words: string };
}

/** A version that could not be filed for a reason no one meant a person to read (a fault, not a refusal). */
const NOT_FILED = "This version could not be filed just now. Write it again from the Library.";

/** The words a refusal says, or the plain sentence for a fault. */
function filingWords(e: unknown): string {
  return e instanceof AppError && e.code !== "internal" ? e.message : NOT_FILED;
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

/** Every refusal the message could meet, before anything is filed, in the person's words (400). */
function checkMessage(body: WriteMessageBody, slots: WriteMessageBody["slots"]): void {
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

export async function writeMessage(
  ctx: RouteContext,
  member: Member,
  body: WriteMessageBody,
): Promise<WriteMessageAnswer> {
  const { name, language, category } = body;
  const slots = [...body.slots].sort((a, b) => a.position - b.position);
  checkMessage(body, slots);
  // A twin: the message is on file already, on some channel. Its other versions are written in the Library.
  if ((await messageVersionRowsOf(ctx.supabase, member.tenantId, { name, language })).length > 0)
    throw new AppError("conflict", SAME_NAME_WORDS, 409);

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
      const saved = await fileWrittenVersion(
        ctx,
        member.tenantId,
        { name, language, channel, ...words },
        { category, variables },
      );
      filed.push({ channel, id: saved.version.id, state: "approved" });
    } catch (e) {
      return answer({ channel, words: filingWords(e) });
    }
  }
  if (!body.versions.whatsapp) return answer();
  try {
    const sent = await submitDraft(ctx, member, whatsappDraft(body, slots));
    filed.push({ channel: "whatsapp", id: sent.id, state: sent.meta_status === "approved" ? "approved" : "pending" });
    return answer();
  } catch (e) {
    return answer({ channel: "whatsapp", words: filingWords(e) });
  }
}
