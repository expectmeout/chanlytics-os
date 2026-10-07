import "server-only";
import {
  AppError,
  OWN_VERSION_CHANNELS,
  TEMPLATE_LANGUAGES,
  isReachOutRow,
  starterByName,
  starterEmailText,
  starterSmsText,
  starterText,
  validateOwnVersion,
  type OwnVersionChannel,
  type StarterTemplate,
  type VersionWords,
} from "@chanlytics/contracts";
import {
  messageSlots,
  ownVersionsFiled,
  removeTemplateVersion,
  saveTemplateVersion,
  type VersionRef,
} from "@chanlytics/db";
import type { Member } from "@/server/route";
import { saveReachOutEmail } from "@/server/campaigns/reach-outs";
import { dbRefusal, type RouteContext } from "@/server/with-route";

/**
 * A message's email and text versions (One message, every channel, step 1): written by a member through one door
 * (save_template_version, 00296), which holds who may, that the message exists and the lengths, and removed through
 * another. What a version may SAY is contracts' validateOwnVersion, run here first, in the person's words: its message's
 * slots and no others, a subject, a text's segments. WhatsApp's versions are Meta's and stay the edge's. A reach-out's
 * email (step 5) is a version too, filed under the name of its step: it is written through its chain's own save, which
 * runs the same email check over the reach-out's rules and keeps what that save guarantees.
 */
type Db = Pick<RouteContext, "supabase">;

/** A version as a person asks for it. */
interface VersionRequest {
  name: string;
  language: string;
  channel: OwnVersionChannel;
  subject?: string | null;
  body: string;
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
  const check = validateOwnVersion(v.channel, { subject: v.subject, body: v.body }, slots, v.language);
  if (!check.ok) throw new AppError("validation", check.error);
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

/** The slots a version of `name` in `language` fills: its message's, from what the workspace holds, else the starter's. */
async function slotsFor(db: Db, tenantId: string, name: string, language: string): Promise<number | null> {
  const held = await messageSlots(db.supabase, tenantId, name, language);
  if (held !== null) return held;
  const starter = starterByName(name);
  return starter ? starterText(starter, language).slots.length : null;
}

/** POST templates/versions: one email or text version of a message, in a language, written or rewritten. */
export async function saveVersion(ctx: RouteContext, member: Member, v: VersionRequest): Promise<VersionSaved> {
  if (isReachOutRow({ name: v.name })) {
    if (v.channel !== "email") throw new AppError("validation", "A reach-out sends email only.");
    const saved = await saveReachOutEmail(ctx, member, v);
    return { version: saved.template, warnings: [], rechecked: saved.rechecked };
  }
  if (!TEMPLATE_LANGUAGES.some((l) => l.id === v.language))
    throw new AppError("validation", "Pick a language from the list.");
  const slots = await slotsFor(ctx, member.tenantId, v.name, v.language);
  if (slots === null) throw new AppError("not_found", "Message not found.", 404);
  return writeVersion(ctx, member.tenantId, v, slots);
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
 * The starter's email and text versions in one language, filed beside its WhatsApp one (which is on file: the caller
 * knows). A version already on file is left as it is, so a person's own words are never replaced by a second click on
 * "Add the set"; a channel the starter writes nothing for (a call's text has no email, an offer no text) is not an
 * outcome and is not listed. A version that cannot be filed is said and does not stop the rest, nor the answer.
 */
export async function fileStarterVersions(
  db: Db,
  tenantId: string,
  s: StarterTemplate,
  language: string,
  filed: Set<string>,
): Promise<StarterVersionResult[]> {
  const out: StarterVersionResult[] = [];
  const slots = starterText(s, language).slots.length;
  for (const channel of OWN_VERSION_CHANNELS) {
    const words = starterWords(s, channel, language);
    if (!words) continue;
    const key = `${channel}|${s.name}|${language}`;
    if (filed.has(key)) {
      out.push({ channel, status: "exists" });
      continue;
    }
    try {
      await writeVersion(db, tenantId, { name: s.name, language, channel, ...words }, slots);
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
