/**
 * One fact, one owner — and a name for the disagreement when there are two.
 *
 * THE DEFECT THIS EXISTS FOR. `tenant_config.brain` mixes three kinds of fact
 * in one hand-edited document: things a human alone can know (services, tone,
 * the number to transfer to), things the PLATFORM knows because it provisioned
 * them (the voice line, the WhatsApp line), and things a third party has
 * VERIFIED (the Google listing's name and address). Only the first kind is
 * safe to type. The other two were typed anyway, into fields with the same
 * names as the real ones, checked against nothing.
 *
 * It had already drifted in production, and in the worst possible direction.
 * On the live salon:
 *
 *   tenant_channels(voice).number_e164 = +13083368109   ← what it ANSWERS
 *   brain.phone_display                = (646) 932-5775 ← what it SAYS to call
 *   brain.profile.handoff_number       = +16469325775   ← where it TRANSFERS
 *
 * The published number is the transfer number. Every WhatsApp customer told
 * "for anything urgent, call (646) 932-5775" is being sent to a person's line
 * rather than to the receptionist that is standing by — and the same string is
 * what gets published to Google. Nothing in the product could notice, because
 * a free-text field has no opinion about a channel row.
 *
 * THE RULE. A fact the system can know is owned by whatever provisions or
 * verifies it. Everywhere else references it. Free text is only for what only
 * a human knows.
 *
 * WHY TYPED STILL WINS HERE. Resolution does NOT silently replace a typed
 * value with the known one, and that is deliberate: a business may genuinely
 * publish a different number from the one it answers — a tracking line, a
 * shopfront, a partner's desk — and a refactor that quietly changed what a
 * live receptionist says to customers would be a worse bug than the one it
 * fixed. So the typed value is used, the disagreement is RECORDED, and a
 * person decides. Detect and expose; never guess.
 */
import { normalizePhone } from "./phone";

/** Where an answer came from, strongest claim first. */
export type FactSource =
  /** The platform provisioned it: a channel row, a bought number. */
  | "provisioned"
  /** A third party verified it: the linked Google Business Profile. */
  | "verified"
  /** The workspace record itself (tenants.name, tenants.timezone). */
  | "workspace"
  /** Somebody typed it into the business form. */
  | "typed"
  /** Nobody has said. */
  | "absent";

export interface Fact<T> {
  value: T | null;
  source: FactSource;
  /** Another source's answer for the same fact, when it differs. */
  disputed?: { value: T; source: FactSource };
}

/** What the platform and its integrations know, independent of anything typed. */
export interface KnownFacts {
  workspace?: { name?: string | null; timezone?: string | null } | null;
  /** tenant_channels rows: what the receptionist actually answers on. */
  channels?: ReadonlyArray<{
    kind: string;
    number_e164?: string | null;
    status?: string | null;
  }> | null;
  /** The linked Google Business Profile, when there is one. */
  listing?: { name?: string | null; address?: string | null } | null;
}

/** The brain fields this resolves over. A subset, so callers need not have parsed everything. */
export interface TypedFacts {
  business_name?: string | null;
  phone_display?: string | null;
  booking_link?: string | null;
  profile?: {
    address?: string | null;
    website?: string | null;
    handoff_number?: string | null;
  } | null;
}

export interface ResolvedFacts {
  business_name: Fact<string>;
  /** What the receptionist tells customers to call. */
  phone_display: Fact<string>;
  booking_link: Fact<string>;
  address: Fact<string>;
  website: Fact<string>;
  /** Where a caller who insists on a person is transferred. Human-only by nature. */
  handoff_number: Fact<string>;
  /** The line the receptionist ANSWERS. Provisioned or nothing — never typed. */
  voice_line: Fact<string>;
  /** The WhatsApp line. Provisioned or nothing. */
  whatsapp_line: Fact<string>;
}

const trimmed = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const activeChannel = (known: KnownFacts | null | undefined, kind: string): string | null => {
  const rows = known?.channels ?? [];
  const row = rows.find((c) => c.kind === kind && (c.status ?? "active") === "active");
  return trimmed(row?.number_e164);
};

/** Two ways of writing one number. `(646) 932-5775` and `+16469325775` are the same fact. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizePhone(a);
  const y = normalizePhone(b);
  return !!x && !!y && x === y;
}

/**
 * Two ways of writing one address.
 *
 * Deliberately loose: Google returns "2581 Pitkin Ave, Brooklyn, NY 11208, USA"
 * for an owner who typed the same thing without the country. Reporting that as
 * a disagreement would train people to ignore the warning, which costs more
 * than the warning is worth.
 */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = textKey(a).replace(/\b(usa|us|united states)\b/g, "").trim();
  const y = textKey(b).replace(/\b(usa|us|united states)\b/g, "").trim();
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/** Same business, allowing for punctuation and case. */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = textKey(a);
  const y = textKey(b);
  return !!x && !!y && x === y;
}

/**
 * The comparable shape of a piece of text.
 *
 * Apostrophes and periods come out ENTIRELY rather than becoming spaces:
 * "Melany's" and "Melanys" are one salon, and collapsing the apostrophe to a
 * space makes them "melany s" and "melanys" — a disagreement nobody has, on
 * the name of the business, shown to its owner. Every other separator becomes
 * one space.
 */
function textKey(v: string | null | undefined): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[’'.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function typedOverKnown<T extends string>(
  typed: T | null,
  known: T | null,
  knownSource: FactSource,
  same: (a: T | null, b: T | null) => boolean,
): Fact<T> {
  if (typed && known) {
    return same(typed, known)
      ? { value: typed, source: "typed" }
      : { value: typed, source: "typed", disputed: { value: known, source: knownSource } };
  }
  if (typed) return { value: typed, source: "typed" };
  if (known) return { value: known, source: knownSource };
  return { value: null, source: "absent" };
}

/**
 * The facts as the product should understand them: one answer each, its source,
 * and whatever disagrees with it.
 */
export function resolveFacts(typed: TypedFacts | null | undefined, known?: KnownFacts | null): ResolvedFacts {
  const p = typed?.profile ?? null;
  const voice = activeChannel(known, "voice");
  const whatsapp = activeChannel(known, "whatsapp");
  const strEq = (a: string | null, b: string | null) => a === b;

  return {
    business_name: typedOverKnown(
      trimmed(typed?.business_name),
      trimmed(known?.listing?.name) ?? trimmed(known?.workspace?.name),
      known?.listing?.name ? "verified" : "workspace",
      sameName,
    ),
    // The one that matters. Compared against the line the receptionist answers.
    phone_display: typedOverKnown(trimmed(typed?.phone_display), voice, "provisioned", samePhone),
    booking_link: typedOverKnown(trimmed(typed?.booking_link), null, "absent", strEq),
    address: typedOverKnown(trimmed(p?.address), trimmed(known?.listing?.address), "verified", sameAddress),
    website: typedOverKnown(trimmed(p?.website), null, "absent", strEq),
    // Human-only by nature: nothing provisions "the person to put a caller through to".
    handoff_number: p?.handoff_number
      ? { value: p.handoff_number, source: "typed" }
      : { value: null, source: "absent" },
    voice_line: voice ? { value: voice, source: "provisioned" } : { value: null, source: "absent" },
    whatsapp_line: whatsapp ? { value: whatsapp, source: "provisioned" } : { value: null, source: "absent" },
  };
}

export type ConflictSeverity = "serious" | "minor";

export interface FactConflict {
  /** Which resolved fact disagrees. */
  fact: keyof ResolvedFacts;
  severity: ConflictSeverity;
  /** What is being used. */
  used: string;
  /** What the system knows instead. */
  known: string;
  knownSource: FactSource;
  /** Said the way this product says things: what it means for a customer. */
  sentence: string;
  /** Where a person goes to settle it. */
  to: string;
}

/**
 * The disagreements, worst first, in the words an owner needs.
 *
 * Severity is about the CUSTOMER, not about the data. A published number that
 * is not the line being answered sends real people to the wrong place; an
 * address that differs from Google's by a country suffix does not.
 */
export function factConflicts(f: ResolvedFacts): FactConflict[] {
  const out: FactConflict[] = [];

  const phone = f.phone_display;
  if (phone.disputed && phone.value) {
    // Is the published number at least the transfer number? Then it is probably
    // deliberate, and saying so makes the warning worth reading.
    const isHandoff = samePhone(phone.value, f.handoff_number.value);
    out.push({
      fact: "phone_display",
      severity: "serious",
      used: phone.value,
      known: phone.disputed.value,
      knownSource: phone.disputed.source,
      sentence: isHandoff
        ? `Your receptionist tells customers to call ${phone.value}, which is the number it transfers to — so they reach a person directly and never the receptionist answering on ${phone.disputed.value}.`
        : `Your receptionist tells customers to call ${phone.value}, but it answers on ${phone.disputed.value}. Anyone who calls the published number does not reach it.`,
      to: "admin/workspace",
    });
  }

  if (f.address.disputed && f.address.value) {
    out.push({
      fact: "address",
      severity: "minor",
      used: f.address.value,
      known: f.address.disputed.value,
      knownSource: f.address.disputed.source,
      sentence: `Your receptionist gives ${f.address.value}; Google has you at ${f.address.disputed.value}.`,
      to: "admin/workspace",
    });
  }

  if (f.business_name.disputed && f.business_name.value) {
    out.push({
      fact: "business_name",
      severity: "minor",
      used: f.business_name.value,
      known: f.business_name.disputed.value,
      knownSource: f.business_name.disputed.source,
      sentence: `Your receptionist introduces the business as ${f.business_name.value}; ${
        f.business_name.disputed.source === "verified" ? "Google lists it" : "this workspace is named"
      } ${f.business_name.disputed.value}.`,
      to: "admin/workspace",
    });
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "serious" ? -1 : 1));
}

/** The words for a source, where one is shown beside a value. */
export const SOURCE_WORDS: Record<FactSource, string> = {
  provisioned: "your line",
  verified: "from Google",
  workspace: "this workspace",
  typed: "you set this",
  absent: "not set",
};
