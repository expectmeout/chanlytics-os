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
 *   tenant_channels(voice).number_e164 = +13085550109   ← what it ANSWERS
 *   brain.phone_display                = (646) 555-0175 ← what it SAYS to call
 *   brain.profile.handoff_number       = +16465550175   ← where it TRANSFERS
 *
 * The published number is the transfer number. Every WhatsApp customer told
 * "for anything urgent, call (646) 555-0175" is being sent to a person's line
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
import { formatPhoneDisplay, samePhone } from "./phone";
import { agoWords } from "./time";

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
  /**
   * The numbers the business keeps that forward to one of its lines (lines of kind "forwarded"): the number
   * customers already call, and the line those calls reach when nobody picks up.
   */
  forwarding?: ReadonlyArray<{ from_e164: string | null; to_e164?: string | null }> | null;
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
  /**
   * The number the business keeps and forwards to the line the receptionist answers now. Provisioned by the
   * forwarding the owner set up, never typed here -- and never a number to put a caller through to, since the call
   * would come straight back.
   */
  kept_line: Fact<string>;
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

/**
 * The kept number whose calls reach THIS line, when there is one. Forwarding is saved against the line it pointed
 * at when the owner set it up (lines.facts.destination_e164); a line since replaced does not receive those calls,
 * so that number is not the receptionist's to publish, and its forwarding is what needs fixing.
 */
const keptReaching = (known: KnownFacts | null | undefined, line: string | null): string | null =>
  line
    ? trimmed((known?.forwarding ?? []).find((r) => trimmed(r.from_e164) && samePhone(r.to_e164, line))?.from_e164)
    : null;

/** The forwarding the platform knows about, from a workspace's lines as Setup reads them (dashboard server/lines.ts). */
export function knownForwarding(
  rows: ReadonlyArray<{ kind: string; e164: string | null; forwarding?: { destination_e164: string | null } | null }>,
): Array<{ from_e164: string; to_e164: string | null }> {
  const out: Array<{ from_e164: string; to_e164: string | null }> = [];
  for (const r of rows) {
    const from = trimmed(r.e164);
    if (r.kind === "forwarded" && from) out.push({ from_e164: from, to_e164: r.forwarding?.destination_e164 ?? null });
  }
  return out;
}

/**
 * Two ways of writing one address.
 *
 * Deliberately loose: Google returns "1200 Maple Ave, Brooklyn, NY 11208, USA"
 * for an owner who typed the same thing without the country. Reporting that as
 * a disagreement would train people to ignore the warning, which costs more
 * than the warning is worth.
 */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = textKey(a)
    .replace(/\b(usa|us|united states)\b/g, "")
    .trim();
  const y = textKey(b)
    .replace(/\b(usa|us|united states)\b/g, "")
    .trim();
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
 * "Marisa's" and "Marisas" are one salon, and collapsing the apostrophe to a
 * space makes them "marisa s" and "marisas" — a disagreement nobody has, on
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
  const kept = keptReaching(known, voice);
  const published = trimmed(typed?.phone_display);
  const strEq = (a: string | null, b: string | null) => a === b;

  return {
    business_name: typedOverKnown(
      trimmed(typed?.business_name),
      trimmed(known?.listing?.name) ?? trimmed(known?.workspace?.name),
      known?.listing?.name ? "verified" : "workspace",
      sameName,
    ),
    // The one that matters, and the one that should usually be absent.
    //
    // The fallback is FORMATTED, not raw E.164: this value is spoken and
    // written to customers -- "Phone: +13085550109" in a prompt becomes a
    // receptionist reading digits aloud -- so the provisioned line arrives as
    // "+1 (308) 555-0109", the way a person says a number.
    //
    // The number the business keeps and forwards to THIS line is the one typed value that is not a disagreement
    // with it: customers call the number they know, and when nobody picks up they reach the receptionist.
    phone_display:
      published && samePhone(published, kept)
        ? { value: published, source: "typed" }
        : typedOverKnown(published, voice ? formatPhoneDisplay(voice) : null, "provisioned", samePhone),
    booking_link: typedOverKnown(trimmed(typed?.booking_link), null, "absent", strEq),
    address: typedOverKnown(trimmed(p?.address), trimmed(known?.listing?.address), "verified", sameAddress),
    website: typedOverKnown(trimmed(p?.website), null, "absent", strEq),
    // Human-only by nature: nothing provisions "the person to put a caller through to".
    handoff_number: p?.handoff_number
      ? { value: p.handoff_number, source: "typed" }
      : { value: null, source: "absent" },
    voice_line: voice ? { value: voice, source: "provisioned" } : { value: null, source: "absent" },
    whatsapp_line: whatsapp ? { value: whatsapp, source: "provisioned" } : { value: null, source: "absent" },
    kept_line: kept ? { value: kept, source: "provisioned" } : { value: null, source: "absent" },
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

  // The transfer number is the number the business keeps and forwards back to the receptionist: nobody picked up
  // there -- that is why the receptionist answered -- so a caller put through to it rings out and comes straight
  // back. The transfer row refuses this number now (phone.ts whyNotAHandoff); this says so of one stored before.
  if (f.handoff_number.value && f.kept_line.value && samePhone(f.handoff_number.value, f.kept_line.value)) {
    const kept = formatPhoneDisplay(f.kept_line.value) ?? f.kept_line.value;
    out.push({
      fact: "handoff_number",
      severity: "serious",
      used: f.handoff_number.value,
      known: kept,
      knownSource: f.kept_line.source,
      sentence: `Your receptionist puts callers who ask for a person through to ${kept}, which forwards the calls nobody picks up back to it — they would come straight back. Give a mobile or another line a person answers.`,
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

/**
 * Which parts of a config a save actually moved.
 *
 * Recorded on the change rather than the values themselves: the config holds a
 * business's own words, its booking link and its customers' escalation rules,
 * and the events ledger is read by more people and for longer than a settings
 * pane is. "hours, services" answers the question anybody actually asks —
 * what changed, and who by — without copying the contents into a second place.
 */
export function changedConfigFields(before: unknown, after: unknown): string[] {
  const top = (v: unknown): Record<string, unknown> => {
    const cfg = (v ?? {}) as {
      brain?: Record<string, unknown>;
      calendar?: unknown;
      notifications?: unknown;
      features?: unknown;
    };
    const brain = cfg.brain ?? {};
    const { profile, ...rest } = brain as Record<string, unknown> & { profile?: Record<string, unknown> };
    // The profile is where most edits land, so its keys are named individually
    // — "profile" changed is true of nearly every save and tells nobody
    // anything. The other sections are one key each: swapping the calendar
    // feed or the alert addresses is a change worth a trace, and until these
    // were here it left none.
    return {
      ...rest,
      ...(profile ?? {}),
      calendar: cfg.calendar ?? null,
      notifications: cfg.notifications ?? null,
      features: cfg.features ?? null,
    };
  };
  const a = top(before);
  const b = top(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
}

/**
 * Who last changed the record, as the line names them: the person reading it,
 * someone else on the team by name, someone who has since left, or nobody
 * known -- a row written before the author was kept (migration 00085).
 *
 * A discriminator rather than a name that may be null: "someone no longer on
 * the team" was passed in as a NAME, so the one sentence that says the author
 * is unknown and the one that says they are gone were told apart by a caller
 * spelling one of them.
 */
export type LastChangedBy = { who: "you" } | { who: "member"; name: string } | { who: "gone" } | { who: "unknown" };

/**
 * A person's name for that line, and never their email address.
 *
 * The roster shows the address deliberately, under the name (`memberWords`):
 * it is how an owner tells two Sarahs apart when they invite one. A sentence
 * under the page's title is not a roster -- it is read at a glance, over a
 * shoulder and on a phone -- and "Last changed by ruben@rjcapital.io, 7m ago"
 * spends more of it on an address than on what it says. What is in front of
 * the @ is what people call each other.
 */
export function lastChangedName(m: { display_name?: string | null; email?: string | null }): string {
  const name = (m.display_name ?? "").trim();
  if (name) return name;
  const local = (m.email ?? "").trim().split("@")[0]?.trim() ?? "";
  return local || "a member";
}

/**
 * "Changed by you, 7m ago" for the Business card, from the row's own author
 * and stamp (migration 00085). No stamp at all says nothing.
 */
export function lastChangedWords(updatedAt: string | null | undefined, by: LastChangedBy, nowMs: number): string {
  const at = updatedAt ? Date.parse(updatedAt) : NaN;
  if (Number.isNaN(at)) return "";
  const when = agoWords(at, nowMs);
  if (by.who === "you") return `Changed by you, ${when}`;
  if (by.who === "member") return `Last changed by ${by.name}, ${when}`;
  if (by.who === "gone") return `Last changed by someone no longer on the team, ${when}`;
  return `Last changed ${when}, before we kept track of who`;
}
