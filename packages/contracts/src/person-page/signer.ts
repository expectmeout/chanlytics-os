/**
 * Who signed a reply (decision 0052). The reading that already runs on a reply to a reach-out returns the name its writer
 * signed with (REPLY_SCHEMA's `signer`, no second call). A model can return a business's name, a role, a mailbox, our own
 * name from the quoted email, or "Priya and Leah", so what it returns is kept only when it passes two tests here:
 *
 *   - **Word for word, in their own lines.** The name stands in what the writer wrote above any quote, their signature
 *     block included (signedLinesOf), as whole words. A name found only in the history their client quoted is ours or
 *     someone else's.
 *   - **The human-name gate.** One to four words, each a word a name is made of (letters, an apostrophe, a hyphen, an
 *     initial's period); never two people ("and", "&") or a group ("team"); never a role or a mailbox word ("Owner",
 *     "Hello"); never business-shaped ("Studio", "LLC"); never the business, the label of the domain it wrote from, the
 *     workspace, a member of it or our own From name.
 *
 * A name is never offered from a no, a STOP, an automatic reply or a list's mail. What passes is offered to the owner as
 * a notice ("Use this name"); it is taken without a press only when automatic naming is on and two independent signals
 * agree (signerAgrees), and it is off until the signer evals pass on the live key (AUTOMATIC_NAMING).
 */
import type { ReplyIntent } from "../reach-out/reach-out-replies";
import { replyTextOf } from "../reach-out/reach-out-replies";

/** Automatic naming (0052, decision 5): off until the signer evals pass on the live key. The press is the default. */
export const AUTOMATIC_NAMING = false;

/** The most characters a signer's name or title keeps (00412's check). */
export const SIGNER_MAX = 80;

/** What a signer is, once it passed the gate. */
export interface Signer {
  name: string;
  title: string | null;
}

/** What the gate is handed: the reading's answer, the reply, and the names that are never a signer. */
export interface SignerFacts {
  /** What the reading answered, unchecked. */
  name: string | null | undefined;
  title?: string | null | undefined;
  /** The reply's whole text, quoted history included: its own lines are found here. */
  text: string | null | undefined;
  intent: ReplyIntent;
  claim: "person" | "automated" | "auto_reply";
  /** The business the reach-out wrote to. */
  business: string | null | undefined;
  /** The address the reply came from: its domain's label is never a name. */
  from: string | null | undefined;
  /** The workspace's name, its members' names and our own From name (the chain's signature). */
  notNames: readonly (string | null | undefined)[];
}

/** Words a role, a mailbox or a group signs with: never a person's name. */
const ROLE_WORDS = new Set([
  "admin",
  "administrator",
  "assistant",
  "billing",
  "bookings",
  "booking",
  "ceo",
  "contact",
  "coordinator",
  "customer",
  "desk",
  "director",
  "enquiries",
  "front",
  "hello",
  "help",
  "hi",
  "info",
  "inquiries",
  "manager",
  "marketing",
  "office",
  "owner",
  "partner",
  "reception",
  "receptionist",
  "reservations",
  "sales",
  "service",
  "staff",
  "support",
  "team",
  "thanks",
  "thank",
  "regards",
  "best",
  "cheers",
  "sincerely",
  "warmly",
  "you",
  "us",
  "we",
  "mr",
  "mrs",
  "ms",
  "dr",
]);

/** Words a business's name is made of: a signer whose name holds one is a business, not a person. */
const BUSINESS_WORDS = new Set([
  "agency",
  "bar",
  "boutique",
  "bridal",
  "cafe",
  "clinic",
  "co",
  "company",
  "corp",
  "corporation",
  "design",
  "events",
  "gallery",
  "group",
  "hair",
  "inc",
  "llc",
  "ltd",
  "services",
  "shop",
  "spa",
  "store",
  "studio",
  "studios",
  "salon", // trade-word: a word the gate refuses in a signer's name, never said to anyone
]);

/** A title that says someone writes for someone else: their name is not the one the business is (signerAgrees). */
const STAND_IN_TITLE = /\b(assistant|office|front desk|coordinator|receptionist|admin|on behalf|team)\b/i;

/** One word of a name: letters (any script), an apostrophe or a hyphen inside it, or an initial with its period. */
const NAME_WORD = /^(\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*|\p{Lu}\.)$/u;

/** Spaces made one, ends trimmed, cut to SIGNER_MAX; null for nothing. */
function squeezed(v: string | null | undefined): string | null {
  const s = (v ?? "").replace(/\s+/g, " ").trim().slice(0, SIGNER_MAX).trim();
  return s ? s : null;
}

/** A name folded for comparing: lower case, marks and punctuation gone, spaces one. */
function foldedName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The label of an address's domain: "bloomandvow" for priya@bloomandvow.example.com. */
function domainLabel(address: string | null | undefined): string | null {
  const a = address ?? "";
  const at = a.lastIndexOf("@");
  if (at < 0) return null;
  const host = a.slice(at + 1).toLowerCase();
  const first = host.split(".")[0] ?? "";
  return first ? first.replace(/[^a-z0-9]/g, "") : null;
}

/** The local part of an address, letters only: "priyanair" for priya.nair@…. */
function localPart(address: string | null | undefined): string | null {
  const a = address ?? "";
  const at = a.lastIndexOf("@");
  if (at <= 0) return null;
  const local = a.slice(0, at).toLowerCase().replace(/\+.*$/, "");
  const letters = local.replace(/[^a-z]/g, "");
  return letters || null;
}

/** "On Tue, Sep 29, Sam <…> wrote:", in the languages a client writes it in: where the quoted email begins. */
const QUOTE_HEAD = /^(on|el|le|am|il|em|op)\b.*\b(wrote|escribió|a écrit|schrieb|ha scritto|escreveu|schreef)\s*:\s*$/i;
const ORIGINAL = /^-{2,}\s*(original message|forwarded message|mensaje original)\s*-{2,}$/i;

/**
 * The lines a signature stands in: what they wrote above the quoted email, the signature block kept. replyTextOf, the
 * reading's own, cuts at a "-- " line (the signature is not their answer), which is exactly where a name is signed; here the
 * text stops only where the quote begins, and a line quoted with ">" is never theirs.
 */
function signedLinesOf(text: string | null | undefined): string {
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (const [i, line] of lines.entries()) {
    const t = line.trim();
    if (ORIGINAL.test(t) || QUOTE_HEAD.test(t) || QUOTE_HEAD.test(`${t} ${(lines[i + 1] ?? "").trim()}`)) break;
    if (t.startsWith(">")) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

/** Whether `words` stand in `text` as whole words, folded alike. */
function standsIn(text: string, words: string): boolean {
  const t = ` ${foldedName(text)} `;
  const w = foldedName(words);
  return !!w && t.includes(` ${w} `);
}

/** The human-name gate: whether `name` is one person's own name, by the rules above. */
export function isPersonsName(
  name: string,
  notNames: readonly (string | null | undefined)[],
  from?: string | null,
): boolean {
  const tokens = name.split(" ");
  if (tokens.length < 1 || tokens.length > 4) return false;
  if (!tokens.every((t) => NAME_WORD.test(t))) return false;
  // A name has at least one word that is not an initial.
  if (!tokens.some((t) => !/^\p{Lu}\.$/u.test(t))) return false;
  const folded = foldedName(name).split(" ");
  if (folded.some((t) => ROLE_WORDS.has(t) || BUSINESS_WORDS.has(t) || t === "and")) return false;
  for (const other of notNames) {
    const o = other ? foldedName(other) : "";
    if (!o) continue;
    // The business, the workspace, a member or our own name, or a name that holds all of one of them.
    if (o === foldedName(name) || standsIn(name, o)) return false;
  }
  const label = domainLabel(from);
  if (label && foldedName(name).replace(/ /g, "") === label) return false;
  return true;
}

/**
 * The reply's signer, or null: what the reading returned, kept only when it stands word for word in the writer's own
 * lines and passes the human-name gate, from a person's own reply that is not a no.
 */
export function signerOf(f: SignerFacts): Signer | null {
  if (f.intent === "no" || f.claim !== "person") return null;
  const name = squeezed(f.name);
  if (!name) return null;
  // Word for word where they signed, and the reply has words of its own above the signature.
  const own = signedLinesOf(f.text);
  if (!replyTextOf(f.text) || !own || !standsIn(own, name)) return null;
  if (!isPersonsName(name, [f.business, ...f.notNames], f.from)) return null;
  const title = squeezed(f.title);
  // A title that is only a name again, or the business, says nothing more.
  const kept =
    title && foldedName(title) !== foldedName(name) && !(f.business && foldedName(title) === foldedName(f.business))
      ? title
      : null;
  return { name, title: kept };
}

/**
 * Whether a signer may be taken without a press (automatic naming): two independent signals agree, the signer and the
 * From line's own words, or the signer and the address's local part (priya@, priya.nair@, pnair@); never for an address
 * whose local part is a role word (hello@, info@), nor for a signer whose title says they write for someone else.
 */
export function signerAgrees(
  s: Signer,
  from: { address: string | null | undefined; name: string | null | undefined },
): boolean {
  if (s.title && STAND_IN_TITLE.test(s.title)) return false;
  const local = localPart(from.address);
  if (!local || ROLE_WORDS.has(local)) return false;
  const words = foldedName(s.name).split(" ");
  const first = words[0] ?? "";
  const last = words[words.length - 1] ?? "";
  const fromName = squeezed(from.name);
  const byFromLine = !!fromName && foldedName(fromName) === foldedName(s.name);
  const byAddress =
    words.length > 0 &&
    (local === first || local === words.join("") || (words.length > 1 && local === `${first[0] ?? ""}${last}`));
  return byFromLine || byAddress;
}
