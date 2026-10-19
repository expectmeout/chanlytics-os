import "server-only";
import {
  AppError,
  MESSAGE_BEGIN_WORDS,
  OWN_VERSION_CHANNELS,
  TEMPLATE_LANGUAGES,
  TEMPLATE_NAME_WORDS,
  channelNeverCarries,
  isReachOutRow,
  purposeOfTemplate,
  starterByName,
  starterEmailText,
  starterSmsText,
  starterText,
  templateNameOk,
  validateOwnVersion,
  type OwnVersionChannel,
  type StarterTemplate,
  type VersionWords,
} from "@chanlytics/contracts";
import {
  createMessageVersion,
  isMissingDoor,
  messageSlots,
  ownVersionsFiled,
  removeTemplateVersion,
  saveTemplateVersion,
  type MessageVariable,
  type VersionRef,
} from "@chanlytics/db";
import type { Member } from "@/server/route";
import { saveReachOutEmail } from "@/server/campaigns/reach-outs";
import { serviceDb } from "@/server/service-db";
import { dbRefusal, type RouteContext } from "@/server/with-route";

/**
 * A message's email and text versions (One message, every channel, step 1): written by a member through one door
 * (save_template_version, 00296), which holds who may, that the message exists and the lengths, and removed through
 * another. What a version may SAY is contracts' validateOwnVersion, run here first, in the person's words: its message's
 * slots and no others, a subject, a text's segments. WhatsApp's versions are Meta's and stay the edge's. A reach-out's
 * email (step 5) is a version too, filed under the name of its step: it is written through its chain's own save, which
 * runs the same email check over the reach-out's rules and keeps what that save guarantees.
 *
 * A message may BEGIN as an email or a text (a message needs no WhatsApp row): the first version of a name the workspace
 * holds no row of is written through another door (create_message_version, 00343), which takes what the message is with
 * it, since no row is there to say it: its category, its values and its title. A starter of the registry says them itself
 * (its category and its slots), and begins only with its own words; a message a member writes says them in `message`,
 * and is an offer or news, never about a visit or a proposal, which only a starter is (the one rule, here). A name the
 * workspace already holds is a message that exists: its version is written beside the rows it has, and `message` is
 * ignored. That door is the service role's alone, since a member who could call it would name the category themselves:
 * the route's role check stands in front of it, and it is told which member it acts for.
 */
type Db = Pick<RouteContext, "supabase">;

/** The session a version is written on, and the member it is written as (the first version of a message is the service role's, naming them). */
type Acting = Pick<RouteContext, "supabase" | "userId">;

/** A message's values as the routes that take them say them: numbered 1, 2, 3 in order, each with a name. */
export const MESSAGE_VALUES_WORDS = "Give each value a number, in order from 1, and a name.";

/** What a message is, said with its first version when the workspace has no row of its name (POST templates/versions). */
interface NewMessage {
  category: "marketing" | "utility";
  variables: Array<{ position: number; label: string; example?: string | null }>;
  title?: string | null;
}

/** A version as a person asks for it. */
interface VersionRequest {
  name: string;
  language: string;
  channel: OwnVersionChannel;
  subject?: string | null;
  body: string;
  message?: NewMessage;
}

/** A version written, what reads badly in it without failing it, and for a reach-out's email, how many sends it sent back to the check. */
interface VersionSaved {
  version: VersionRef;
  warnings: string[];
  rechecked?: number;
}

/**
 * Check one version against its message's slots and write it. The slot count is the message's own, from its row on file
 * (WhatsApp's first), else the starter's of that name; a message the workspace has no row of is not found, as the door
 * says it. Refusals are the person's words: the check's, or the door's.
 */
async function writeVersion(db: Db, tenantId: string, v: VersionRequest, slots: number): Promise<VersionSaved> {
  const check = checkedWords(v, slots);
  const door = await saveTemplateVersion(db.supabase, {
    tenantId,
    name: v.name,
    language: v.language,
    channel: v.channel,
    subject: check.value.subject,
    body: check.value.body,
  });
  if (!door.ok) throw dbRefusal(door.error);
  return { version: door.version, warnings: check.warnings };
}

/** A version's words checked on their channel's rules against the message's slots, or the refusal in the person's words. */
function checkedWords(v: VersionRequest, slots: number): { value: VersionWords; warnings: string[] } {
  const check = validateOwnVersion(v.channel, { subject: v.subject, body: v.body }, slots, v.language);
  if (!check.ok) throw new AppError("validation", check.error);
  return check;
}

/** A starter's values as the edge files them on its WhatsApp row: numbered from 1, each with the label and the example its slot has. */
function starterVariables(s: StarterTemplate, language: string): MessageVariable[] {
  return starterText(s, language).slots.map((slot, i) => ({
    position: i + 1,
    label: slot.label,
    example: slot.example,
  }));
}

/** A refusal of the door that begins a message: a database that has not run 00343 says so in one sentence, any other is the door's own. */
function beginRefusal(e: { code: string | null; message: string }): AppError {
  return isMissingDoor(e) ? new AppError("conflict", MESSAGE_BEGIN_WORDS.doorNotSwitchedOn, 409) : dbRefusal(e);
}

/**
 * Write the first version of a message, its words already checked, through the door that needs no row of its name, as the
 * member who asked (the door is the service role's, and asks that this person is a member who may). A text never carries
 * an offer (contracts channelNeverCarries, the sentence the ticks and the sends say), refused before the door is asked.
 */
async function beginMessage(
  userId: string,
  tenantId: string,
  v: VersionRequest,
  words: { value: VersionWords; warnings: string[] },
  message: { category: "marketing" | "utility"; variables: MessageVariable[]; title: string | null },
): Promise<VersionSaved> {
  const never = channelNeverCarries(v.channel, purposeOfTemplate(message.category));
  if (never) throw new AppError("validation", never);
  const door = await createMessageVersion(serviceDb(), {
    tenantId,
    userId,
    name: v.name,
    language: v.language,
    channel: v.channel,
    subject: words.value.subject,
    body: words.value.body,
    ...message,
  });
  if (!door.ok) throw beginRefusal(door.error);
  return { version: door.version, warnings: words.warnings };
}

/**
 * A message somebody writes is an offer or news (rule 4): nobody reviews a category its writer declares, so `utility`
 * (about their own booking or proposal) is a starter's alone, which Chanlytics writes, or comes with a WhatsApp version
 * Meta reviews. The one check of it: a member's first version of a message (beginVersion, POST templates/versions, which
 * never has a WhatsApp version, in MESSAGE_BEGIN_WORDS.customIsAnOffer) and a message written whole with no WhatsApp
 * version (write-message.ts, in MESSAGE_BEGIN_WORDS.utilityNeedsWhatsapp, since that door takes one with it): each door
 * says it in `words` true of what it takes.
 */
export function refuseWrittenUtility(category: "marketing" | "utility", words: string): void {
  if (category === "utility") throw new AppError("validation", words);
}

/**
 * The first version of a message the workspace holds no row of. A starter of the registry begins as itself: its category,
 * its values and no title of its own (the starter's title is read from the registry), only on a channel it writes
 * something for in this language, else it is not found, as it was before this door existed, and only with the starter's
 * own words there (the starter set's): the member's words are not the starter's, and a utility category is the
 * starter's alone, so they are refused until the starter set is added and its words changed in the Library. Any other name needs
 * `message`, which is what a member writes it as: under a name of the shape Meta takes, with the values and title it
 * says, and an offer or news, never about a visit or a proposal. Nobody reviews a message with no WhatsApp row, so only
 * a starter, which Chanlytics writes, may be about a visit. With neither, there is no message.
 */
async function beginVersion(db: Acting, tenantId: string, v: VersionRequest): Promise<VersionSaved> {
  const starter = starterByName(v.name);
  if (starter) {
    const own = starterWords(starter, v.channel, v.language);
    if (!own) throw new AppError("not_found", "Message not found.", 404);
    const variables = starterVariables(starter, v.language);
    const words = checkedWords(v, variables.length);
    const theirs = checkedWords({ ...v, subject: own.subject, body: own.body }, variables.length).value;
    if (words.value.subject !== theirs.subject || words.value.body !== theirs.body)
      throw new AppError("validation", MESSAGE_BEGIN_WORDS.starterNeedsItsOwnWords);
    return beginMessage(db.userId, tenantId, v, words, { category: starter.category, variables, title: null });
  }
  if (!v.message) throw new AppError("not_found", "Message not found.", 404);
  if (!templateNameOk(v.name)) throw new AppError("validation", TEMPLATE_NAME_WORDS);
  const { category, title } = v.message;
  const variables = v.message.variables.map((x) => ({
    position: x.position,
    label: x.label,
    example: x.example ?? null,
  }));
  const words = checkedWords(v, variables.length);
  refuseWrittenUtility(category, MESSAGE_BEGIN_WORDS.customIsAnOffer);
  return beginMessage(db.userId, tenantId, v, words, { category, variables, title: title ?? null });
}

/**
 * One version of a message, its words not yet checked: beside the rows the message has (`held` is how many values they
 * say), or, with none, as its first (beginVersion). The one place that tells a message that exists from one that begins:
 * a member's save and the starter set both write through it.
 */
function writeOrBegin(db: Acting, tenantId: string, v: VersionRequest, held: number | null): Promise<VersionSaved> {
  return held !== null ? writeVersion(db, tenantId, v, held) : beginVersion(db, tenantId, v);
}

/**
 * POST templates/versions: one email or text version of a message, in a language, written or rewritten. A name the
 * workspace holds a row of is a message that exists, and its version is checked against that message's slots and written
 * beside its rows (`message`, if sent, is ignored: the message already says what it is); one it holds no row of
 * begins a message (beginVersion).
 */
export async function saveVersion(ctx: RouteContext, member: Member, v: VersionRequest): Promise<VersionSaved> {
  if (isReachOutRow({ name: v.name })) {
    if (v.channel !== "email") throw new AppError("validation", "A sequence to leads sends email only.");
    const saved = await saveReachOutEmail(ctx, member, v);
    return { version: saved.template, warnings: [], rechecked: saved.rechecked };
  }
  if (!TEMPLATE_LANGUAGES.some((l) => l.id === v.language))
    throw new AppError("validation", "Pick a language from the list.");
  const held = await messageSlots(ctx.supabase, member.tenantId, v.name, v.language);
  return writeOrBegin(ctx, member.tenantId, v, held);
}

/**
 * POST templates/message: one email or text version of a message written whole (write-message.ts), which says what the
 * message is (its category and values) with every version at once. Beside the rows its message has, where the workspace
 * holds any of its name (`held` is how many values they say, as the caller read them once: writeVersion, the message's
 * own slots and category), else as its first (beginMessage: the category and values said, a text of an offer refused).
 * The words are checked here as everywhere (checkedWords). No starter's name reaches here, nor a category or a number of
 * values other than the message's on file, and a utility category only with a WhatsApp version for Meta to review: the
 * caller refuses each first (refuseWrittenUtility, the check a member's first version meets).
 */
export async function fileWrittenVersion(
  db: Acting,
  tenantId: string,
  v: VersionRequest,
  held: number | null,
  message: { category: "marketing" | "utility"; variables: MessageVariable[] },
): Promise<VersionSaved> {
  if (held !== null) return writeVersion(db, tenantId, v, held);
  const words = checkedWords(v, message.variables.length);
  return beginMessage(db.userId, tenantId, v, words, { ...message, title: null });
}

/** DELETE templates/versions/:id: an email or text version a member wrote, and nothing else (the door says which rows). */
export async function removeVersion(db: Db, templateId: string): Promise<VersionRef> {
  const door = await removeTemplateVersion(db.supabase, templateId);
  // A version a playbook or broadcast still names is a conflict the owner can resolve, not a bad request.
  if (!door.ok) throw dbRefusal(door.error, { code: "conflict", status: 409 });
  return door.version;
}

/* ---- The starter set's versions ---- */

type StarterVersionStatus = "saved" | "exists" | "failed";

/** One channel's version of a starter in a language, and what became of it. */
export interface StarterVersionResult {
  channel: OwnVersionChannel;
  status: StarterVersionStatus;
  detail?: string;
}

/** The keys of the email and text versions the workspace already holds of these messages: `channel|name|language`. */
export async function startersFiled(db: Db, tenantId: string, names: string[]): Promise<Set<string>> {
  const rows = await ownVersionsFiled(db.supabase, tenantId, names);
  return new Set(rows.map((r) => `${r.channel}|${r.name}|${r.language}`));
}

/** The words the starter has for one channel in exactly this language; null where it writes none (an offer has no text). */
function starterWords(s: StarterTemplate, channel: OwnVersionChannel, language: string): VersionWords | null {
  if (channel === "email") {
    const t = s.email?.[language] ? starterEmailText(s, language) : null;
    return t ? { subject: t.subject, body: t.body } : null;
  }
  const t = s.sms?.[language] ? starterSmsText(s, language) : null;
  return t ? { subject: null, body: t.body } : null;
}

/**
 * The starter's email and text versions in one language, for the channels asked (both, unless the caller names fewer).
 * Beside its WhatsApp version where the message has one, and with none the first version of the name begins the message
 * as the starter (beginVersion: its category and its values), the other then written beside it, so a workspace with no
 * WhatsApp number files them all the same. A version already on file is left as it is, so a person's own words are never
 * replaced by a second click on "Add the set"; a channel the starter writes nothing for (a call's text has no email, an
 * offer no text) is not an outcome and is not listed. A version that cannot be filed is said and does not stop the
 * rest, nor the answer.
 */
export async function fileStarterVersions(
  db: Acting,
  tenantId: string,
  s: StarterTemplate,
  language: string,
  filed: Set<string>,
  channels: readonly OwnVersionChannel[] = OWN_VERSION_CHANNELS,
): Promise<StarterVersionResult[]> {
  const out: StarterVersionResult[] = [];
  const slots = starterText(s, language).slots.length;
  // Whether the message has a row yet, on any channel and in any language: read when there is a version to write, and
  // true from the first one written.
  let held: number | null | undefined;
  for (const channel of channels) {
    const words = starterWords(s, channel, language);
    if (!words) continue;
    const key = `${channel}|${s.name}|${language}`;
    if (filed.has(key)) {
      out.push({ channel, status: "exists" });
      continue;
    }
    try {
      held = held === undefined ? await messageSlots(db.supabase, tenantId, s.name, language) : held;
      await writeOrBegin(db, tenantId, { name: s.name, language, channel, ...words }, held === null ? null : slots);
      held = slots;
      filed.add(key);
      out.push({ channel, status: "saved" });
    } catch (e) {
      out.push({
        channel,
        status: "failed",
        // The door's own words when it refused; a fault (which dbRefusal answers as "internal") is no one's to read.
        detail:
          e instanceof AppError && e.code !== "internal"
            ? e.message
            : "The version could not be saved. Add the set again to retry.",
      });
    }
  }
  return out;
}
