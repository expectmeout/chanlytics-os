/**
 * Control plane types (PRD E1/E3/E4) — the single source every boundary
 * imports: the Settings form, the /v1 routes, and the edge runtime all parse
 * the same schemas, so an option that exists in the UI exists in the runtime
 * by construction (anti-junk rule R1).
 */
import { z } from "zod";
import { MEMBERSHIP_ROLES } from "./enums";

/* ---------------------------------------------------------------- E1 roles */

export const ROLES = MEMBERSHIP_ROLES;
export type Role = (typeof ROLES)[number];

/** What each role may do. Mirrors the mockup's ST_PERMS exactly — the client
 *  gate() chips read this shape; the server re-checks via requireRole. */
export const ROLE_PERMS: Record<Role, { approve: boolean; autonomy: boolean; disconnect: boolean; billing: boolean; team: boolean; settings: boolean }> = {
  // `settings` is the business details and who is alerted: PUT /settings is
  // owner-only, and the form used to open on the autonomy gate, which let an
  // operator fill it in and be refused at Save.
  owner:    { approve: true,  autonomy: true,  disconnect: true,  billing: true,  team: true,  settings: true },
  operator: { approve: true,  autonomy: true,  disconnect: false, billing: false, team: false, settings: false },
  viewer:   { approve: false, autonomy: false, disconnect: false, billing: false, team: false, settings: false },
};

/* --------------------------------------------------------------- E3 policy */

export const POLICY_CLASSES = ["reply", "booking", "faq", "reengage", "campaign", "money"] as const;
export type PolicyClass = (typeof POLICY_CLASSES)[number];

/** 'veto' exists in the enum (and the DB CHECK) but is NOT offered by any UI
 *  until the drafts/countdown engine exists — R1: no option without an
 *  enforcer. The runtime treats an unexpected mode as 'ask' (fail safe). */
export const POLICY_MODES = ["auto", "veto", "ask", "never"] as const;
export type PolicyMode = (typeof POLICY_MODES)[number];

export const PolicyLimitsSchema = z
  .object({
    max_replies_day: z.number().int().min(1).max(200).optional(),
    pause_hours: z.number().int().min(1).max(168).optional(),
    /**
     * How long the receptionist WAITS before its own reply goes out, in ms.
     *
     * Only meaningful when mode is 'veto'. A text channel is not a phone
     * call — nobody expects an answer in under a second — so the delay costs
     * the customer nothing and buys the business a window to redirect the bot
     * before it speaks, rather than apologising for it afterwards.
     */
    reply_delay_ms: z.number().int().min(5000).max(600000).optional(),
  })
  .strict();
export type PolicyLimits = z.infer<typeof PolicyLimitsSchema>;

export interface PolicyRow {
  id: string;
  class: PolicyClass;
  mode: PolicyMode;
  subject_type: "segment" | "contact" | null;
  subject_id: string | null;
  limits: PolicyLimits;
  updated_at: string;
}

/* --------------------------------------------------------------- E4 config */

/* ------------------------------------------------------------------ profile
 * The business's facts, as FIELDS.
 *
 * They used to live only inside `system_prompt` — five thousand characters of
 * prose holding the address, the hours, every service and its duration, the
 * booking link and the rules. Prose cannot be projected: you cannot render it
 * as a form, diff it when the hours change, or hand it to a voice provider that
 * wants variables. So the voice agent got its own copy of the same facts in
 * another dashboard, and the two drift the first time somebody opens later.
 *
 * Every field is OPTIONAL and the profile itself is optional, because Melany's
 * hand-written prompt is live and working. Nothing composes until a workspace
 * actually fills these in.
 */

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * One stretch of the day the doors are open.
 *
 * DELIBERATELY LENIENT — no .strict(), no .refine(), no length bounds.
 *
 * This schema is on the READ path: apps/edge parses it out of the database on
 * every inbound message, and a parse failure there is not a warning. It sets
 * configBroken, the WhatsApp receptionist stops replying, and the voice agent
 * is handed no facts at all. Rules that reject a stored row are rules that
 * mute a live line, so the shape is all that lives here. Everything that can
 * be WRONG rather than malformed — reversed times, overlapping shifts, a
 * calendar date that does not exist — is checked on the way IN, and the
 * composer is written to tell the truth about whatever is already stored.
 */
export const IntervalSchema = z.object({ open: TIME, close: TIME });

export const HoursSchema = z
  .object({
    /** "09:00". Absent or null = closed that day, which is a real answer. */
    open: TIME.nullable().optional(),
    close: TIME.nullable().optional(),
    /**
     * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
     * actually keeps. Additive: a day that has always been one stretch keeps
     * saying so with open/close, and no stored config is rewritten.
     */
    intervals: z.array(IntervalSchema).optional(),
  })
  .strict();

/** A plain calendar date in the business's own zone — never an instant. */
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * A day the business is shut whatever the weekly grid says.
 *
 * `until` because "closed 24 December to 2 January" is ONE decision an owner
 * makes, and ten separate rows is how a holiday week ends up half-entered.
 *
 * Lenient for the same reason as IntervalSchema. Note the date regex accepts
 * 2026-11-31, which is not a day; the renderer checks that it round-trips and
 * prints the raw string when it does not, rather than confidently naming the
 * wrong date.
 */
export const ClosureSchema = z.object({
  date: DATE,
  until: DATE.optional(),
  note: z.string().max(200).optional(),
});

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const ServiceSchema = z
  .object({
    name: z.string().min(1).max(80),
    /** Minutes. The receptionist is asked "how long does it take" constantly. */
    duration_min: z.number().int().min(1).max(1440).optional(),
    /**
     * Free text, not a number, and deliberately so: "from $45", "quoted at
     * consult", "varies by length". A price the business cannot state flatly
     * must not be forced into a field that looks like it can.
     */
    price_note: z.string().max(120).optional(),
  })
  .strict();

/**
 * The rules that must survive editing.
 *
 * Flags, never prose. A free-text prompt box hands an owner the ability to
 * delete the price policy, the never-confirm-a-booking rule and the AI
 * disclosure without knowing they have — and nothing downstream could tell.
 * Composed in every time, and default ON: the safe reading of an absent value.
 */
export const GuardrailsSchema = z
  .object({
    never_quote_prices: z.boolean().optional(),
    never_confirm_booking: z.boolean().optional(),
    disclose_ai: z.boolean().optional(),
  })
  .strict();

export const BusinessProfileSchema = z
  .object({
    address: z.string().max(300).optional(),
    hours: z.record(z.enum(DAYS), HoursSchema).optional(),
    /** Dates the business is shut regardless of the weekly grid. */
    closures: z.array(ClosureSchema).optional(),
    services: z.array(ServiceSchema).max(60).optional(),
    languages: z.array(z.string().min(2).max(40)).max(8).optional(),
    guardrails: GuardrailsSchema.optional(),
    /** What must reach a person. One short line each. */
    escalate_when: z.array(z.string().min(1).max(200)).max(20).optional(),
    tone: z.string().max(200).optional(),
    /**
     * Anything the owner wants said that no field covers.
     *
     * The escape hatch that keeps this model honest — without it, structuring
     * the facts would mean losing whatever did not fit, and the first migration
     * would be a downgrade.
     */
    extra_instructions: z.string().max(8000).optional(),
  })
  .strict();

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;
export type Hours = z.infer<typeof HoursSchema>;
export type Service = z.infer<typeof ServiceSchema>;
export type Interval = z.infer<typeof IntervalSchema>;
export type Closure = z.infer<typeof ClosureSchema>;

export const BrainConfigSchema = z
  .object({
    business_name: z.string().min(1).max(120),
    phone_display: z.string().min(3).max(40),
    booking_link: z.string().url().max(500),
    /** The complete system prompt the model receives — the "AI memory" pane's
     *  one hard promise is that what it shows is EXACTLY this, nothing more. */
    system_prompt: z.string().min(40).max(20000),
    /**
     * The business's facts, as fields.
     *
     * Optional: every config written before this existed stays valid, and
     * nothing composes until a workspace actually fills it in. When present
     * it REPLACES system_prompt as the source the prompt is built from.
     */
    profile: BusinessProfileSchema.optional(),
    fallbacks: z
      .object({
        /** Sent when no model key is configured. */
        greeting: z.string().min(1).max(2000),
        /** Sent when the model call failed. */
        error: z.string().min(1).max(2000),
        /** Sent for voice notes / photos before escalating. */
        non_text: z.string().min(1).max(2000),
      })
      .strict(),
  })
  .strict();

export type BrainConfig = z.infer<typeof BrainConfigSchema>;

/**
 * The parts of a brand-new receptionist nobody should have to write.
 *
 * BrainConfigSchema requires a system_prompt and three fallback messages, and
 * until this existed there was no way to produce them from inside the product:
 * provisioning inserts an empty tenant_config row and the settings form only
 * ever edited the profile ON an existing brain. Onboarding a business meant
 * hand-writing its config into the database.
 *
 * It lives HERE, beside the schema it has to satisfy, because a default that
 * drifts out of spec does not fail in review — it fails for the next business
 * that tries to set itself up.
 *
 * The prompt states no facts on purpose. The address, hours and services are
 * composed from the profile; a baseline that repeated them would be a second
 * copy of every one, free to go stale the moment the owner edits a field.
 */
export function newReceptionistDefaults(
  businessName: string,
  phoneDisplay: string,
  bookingLink: string,
): Pick<BrainConfig, "system_prompt" | "fallbacks"> {
  return {
    system_prompt:
      `You are the assistant for ${businessName}, answering inbound customer messages. ` +
      "You are warm, concise and professional — a great front-desk person, in text form. " +
      "If you do not know something, say so plainly and offer to have a person follow up.",
    // What a customer reads when the model cannot be reached. Built from what
    // the owner just typed, so they are the business's own details.
    fallbacks: {
      greeting: `Hi! Thanks for reaching out to ${businessName}.\n\nBook anytime: ${bookingLink}\n\nOr reply here with any question.`,
      error: `Thanks for reaching out to ${businessName}! Book anytime: ${bookingLink} — or a member of our team will reply here soon.`,
      non_text: `Thanks for your message! A member of our team will take a look and reply here soon. For anything urgent, call us at ${phoneDisplay}.`,
    },
  };
}

export const NotificationsConfigSchema = z
  .object({
    escalation_emails: z.array(z.string().email()).min(1).max(10),
    from: z.string().max(200).optional(),
  })
  .strict();
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;

/**
 * The whole tenant_config.config column. Sections are optional — a tenant with
 * no brain section is a tenant whose receptionist does not speak (persist +
 * escalate only). Safe-by-default beats a leaked persona.
 *
 * DELIBERATELY NOT `.strict()` AT THE TOP LEVEL, while each SECTION still is.
 *
 * The edge and the dashboard are separate Vercel projects that deploy
 * independently. With a strict top level, the first dashboard deploy to write a
 * new section — `guardrails`, a per-tenant allowlist, anything — would be
 * rejected in its entirety by the older edge still running beside it. The
 * receptionist would go completely silent on a live line, and it would be
 * logged identically to "no brain profile configured": a total mute that reads
 * as a configuration absence.
 *
 * Unknown top-level keys are therefore STRIPPED rather than fatal, so an older
 * edge ignores a section it has never heard of and keeps answering with the
 * persona it does understand. Strictness stays where it catches real mistakes:
 * inside a section, where a typo means a field the runtime silently would not
 * apply.
 */
export const TenantConfigSchema = z.object({
  brain: BrainConfigSchema.optional(),
  notifications: NotificationsConfigSchema.optional(),
});
export type TenantConfig = z.infer<typeof TenantConfigSchema>;

/* -------------------------------------------------------- writing it back
 *
 * The rules a config has to satisfy to be SAVED, kept deliberately apart from
 * the rules it has to satisfy to be READ.
 *
 * Data already in the database has to keep parsing; data on its way in does
 * not. A refinement on the read schema turns an already-stored bad row into a
 * whole-config parse failure, and on this codepath that is not a warning — it
 * is configBroken: the receptionist stays silent and staff are told the
 * settings could not be read. So everything that is WRONG rather than
 * malformed is checked here, on the way in, where the answer is a message
 * naming the field instead of a muted phone line.
 *
 * This is not the only door — migrations and a service-role client both write
 * tenant_config directly — which is exactly why the composer is written to
 * tell the truth about rows these rules would have refused.
 */

/** The most shifts one day may be split into. Must match the editor's cap. */
export const MAX_INTERVALS_PER_DAY = 4;
/** As many closures as the composer will state — there is no render cap. */
export const MAX_CLOSURES = 60;

/** Does this string name a real day? "2026-11-31" does not. */
export function isRealDate(key: string): boolean {
  const at = new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === key;
}

const DAY_NAME: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

function checkDay(h: Hours, day: string, ctx: z.RefinementCtx): void {
  const name = DAY_NAME[day] ?? day;
  const at = (...rest: (string | number)[]) => ["brain", "profile", "hours", day, ...rest];
  const open = h.open ?? undefined;
  const close = h.close ?? undefined;
  if (!!open !== !!close) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: at(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`,
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: at("close"),
      message: `${name} closes at or before it opens.`,
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: at("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY} shifts.`,
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: at("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`,
      });
    }
  });
  // Overlap, not adjacency. Two shifts that TOUCH — 09:00-13:00 and
  // 13:00-19:00 — are an ordinary two-stylist day, and rejecting them would
  // refuse a legitimate entry. Compared on sorted copies so the owner is not
  // told their day is wrong merely because they typed the afternoon first.
  const sorted = [...iv].sort((a, b) => (a.open < b.open ? -1 : a.open > b.open ? 1 : 0));
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: at("intervals", n, "open"),
        message: `${name}: two shifts overlap.`,
      });
    }
  }
}

function checkClosure(c: Closure, n: number, ctx: z.RefinementCtx): void {
  const at = (...rest: (string | number)[]) => ["brain", "profile", "closures", n, ...rest];
  // The read regex accepts 2026-11-31. Caught here so it never reaches a
  // renderer that would have to print it raw to avoid naming the wrong day.
  if (!isRealDate(c.date)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: at("date"),
      message: `${c.date} is not a date on the calendar.`,
    });
  }
  if (c.until && !isRealDate(c.until)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: at("until"),
      message: `${c.until} is not a date on the calendar.`,
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: at("until"),
      message: "A closure cannot end before it starts.",
    });
  }
}

/**
 * The same config, with the rules that only apply on the way IN.
 *
 * Wrapping TenantConfigSchema rather than replacing it, so the shape and the
 * lenience stay defined in exactly one place and this can only ever be
 * stricter.
 */
export const TenantConfigWriteSchema = TenantConfigSchema.superRefine((cfg, ctx) => {
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES} closures.`,
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure(c, n, ctx));
});

export type TenantConfigParse =
  | { ok: true; config: TenantConfig }
  | { ok: false; issues: string[] };

/**
 * Parse unknown JSONB into TenantConfig.
 *
 * Returns the ISSUES rather than a bare null, because the runtime needs to tell
 * "this tenant has not been configured" from "this tenant's configuration is
 * broken". Both end in silence, but only one of them is somebody's mistake, and
 * collapsing them meant an operator reading "no brain profile configured" while
 * a perfectly good persona sat in the database behind one bad field.
 */
export function parseTenantConfigResult(raw: unknown): TenantConfigParse {
  const r = TenantConfigSchema.safeParse(raw ?? {});
  if (r.success) return { ok: true, config: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/** Convenience for callers that genuinely cannot act on the difference. */
export function parseTenantConfig(raw: unknown): TenantConfig | null {
  const r = parseTenantConfigResult(raw);
  return r.ok ? r.config : null;
}


/* ---------------------------------------------------------------- compose */

const DAY_LABEL: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

/** "Monday–Friday 9:00–18:00" style lines, collapsing identical runs. */
/** One stretch of consecutive days that share the same hours. */
export interface HoursRun {
  /** Day key the run starts on, e.g. "mon". */
  from: string;
  /** Day key it ends on. Equal to `from` for a single day. */
  to: string;
  /** "09:30–18:00", or "Closed". */
  text: string;
}

/**
 * Collapse the week into runs of identical days.
 *
 * Exported because the Settings card had a hand-copied second implementation
 * of this loop, under a comment promising it matched — which is the setup for
 * the owner's own summary disagreeing with what the receptionist says. The
 * ALGORITHM belongs in one place; the FORMATTING does not, because the two
 * surfaces genuinely differ (the prompt says "Monday–Thursday: 09:30–18:00",
 * the card says "Mon–Thu 09:30–18:00"). So this returns the runs and each
 * caller writes its own sentence.
 */
/**
 * Every stretch a day is open, sorted and merged.
 *
 * Sorted because the gap between shifts is computed from neighbours, and array
 * order is not chronology: [15:00-19:00, 09:30-13:00] read positionally says
 * "closed 19:00-09:30", a window running backwards through the night. Merged
 * because two touching shifts are one stretch, and a zero-length gap would
 * otherwise be printed as "closed 13:00-13:00".
 *
 * open/close and intervals are UNIONED rather than one silently winning. Both
 * can be present in a stored row, and dropping either would make a fact
 * disappear from the prompt with nothing to show it had — which is the exact
 * failure this whole area has already had.
 */
function dayIntervals(h: Hours | undefined): { open: string; close: string }[] {
  const raw: { open: string; close: string }[] = [];
  if (h?.open && h?.close) raw.push({ open: h.open, close: h.close });
  for (const iv of h?.intervals ?? []) if (iv?.open && iv?.close) raw.push(iv);
  const usable = raw
    .filter((x) => x.close > x.open)
    .sort((a, b) => (a.open < b.open ? -1 : a.open > b.open ? 1 : 0));
  const merged: { open: string; close: string }[] = [];
  for (const iv of usable) {
    const last = merged[merged.length - 1];
    if (last && iv.open <= last.close) {
      if (iv.close > last.close) last.close = iv.close;
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

function joinList(parts: string[]): string {
  if (parts.length < 3) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * What one day says.
 *
 * "Closed" is an affirmative claim, so it is reserved for a day that states
 * nothing. A day that states SOMETHING unusable — an opening time with no
 * closing time, a span that ends before it starts — is not closed; it is a
 * question we cannot answer, and saying "Closed" to a customer would be
 * telling them not to come on a day the business may well be open.
 */
function dayText(h: Hours | undefined): string {
  const spans = dayIntervals(h);
  if (spans.length) {
    const open = joinList(spans.map((x) => `${x.open}–${x.close}`));
    const gaps = spans.slice(1).map((x, i) => `${spans[i].close}–${x.open}`);
    return gaps.length ? `${open} (closed ${joinList(gaps)})` : open;
  }
  const saidSomething = !!(h?.open || h?.close || h?.intervals?.length);
  return saidSomething ? "Hours not confirmed — ask them to call" : "Closed";
}

export function hoursRuns(hours: Record<string, Hours> | undefined): HoursRun[] {
  if (!hours) return [];
  const spans = DAYS.map((d) => ({ day: d as string, text: dayText(hours[d]) }));
  // A seven-line block is harder to read aloud AND longer in a prompt, for no
  // extra information.
  const out: HoursRun[] = [];
  let i = 0;
  while (i < spans.length) {
    let j = i;
    while (j + 1 < spans.length && spans[j + 1].text === spans[i].text) j++;
    out.push({ from: spans[i].day, to: spans[j].day, text: spans[i].text });
    i = j + 1;
  }
  return out;
}

function hoursLines(hours: Record<string, Hours> | undefined): string[] {
  return hoursRuns(hours).map((r) => {
    const label = r.from === r.to ? DAY_LABEL[r.from] : `${DAY_LABEL[r.from]}–${DAY_LABEL[r.to]}`;
    return `${label}: ${r.text}`;
  });
}

/** True when a profile carries anything worth composing from. */
export function hasProfile(p: BusinessProfile | undefined | null): boolean {
  if (!p) return false;
  // Seven days that are all closed is a SHAPE, not a fact. The editor writes
  // every day on save, so counting keys would let an owner who opened the form
  // and pressed Save with nothing filled in switch their receptionist onto a
  // composed prompt containing no hours, no services and no address — strictly
  // worse than the hand-written one it replaced. At least one real opening
  // time has to exist before this counts.
  const statedHours =
    !!p.hours && Object.values(p.hours).some((h) => (h?.open && h?.close) || h?.intervals?.length);
  // NOT closures. Their contents EXPIRE: a profile whose only fact is a closure
  // would compose a real prompt while it was upcoming and, the day after it
  // passed, compose one with no hours, no address and no services — while this
  // still returned true, so it could never fall back to the hand-written
  // prompt either. A prompt that changes what it says because a date went by,
  // from a config nobody touched.
  return !!(
    p.address || p.tone || p.extra_instructions || statedHours ||
    p.services?.length || p.languages?.length || p.escalate_when?.length
  );
}

/**
 * The receptionist's instructions, composed from the business's facts.
 *
 * ONE function, so the WhatsApp prompt and the voice prompt are built from the
 * same source and cannot describe two different businesses. Channel shapes the
 * delivery, never the facts: `channel` only changes the medium-specific lines
 * at the end — how long a reply should be, what to do with a voice note.
 *
 * The guardrails are appended LAST and unconditionally. They are not the
 * owner's to remove, and putting them last means no earlier instruction can
 * read as overriding them.
 */
/**
 * What the receptionist is told when it has no clock.
 *
 * Silence would be worse than this. A model given opening hours and no date
 * will answer "are you open right now?" anyway, confidently, from nothing.
 */
/** "YYYY-MM-DD" for an instant, as the business experiences it. */
function dateKeyInZone(tz: string, at: Date): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const y = get("year"), m = get("month"), d = get("day");
    return y && m && d ? `${y}-${m}-${d}` : null;
  } catch {
    return null;
  }
}

/**
 * A stored date is only named if it is a real day.
 *
 * The regex on the read path accepts 2026-11-31, which does not exist. Date
 * parsing rolls it forward to 1 December — so the receptionist would announce
 * a closure on a day the business is OPEN, and then drop the row on the very
 * day it claimed. Rather than confidently name the wrong date, an impossible
 * one is printed exactly as stored, where it reads as the mistake it is.
 */
function labelDate(key: string, withWeekday: boolean): string {
  const at = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(at.getTime()) || dateKeyInZone("UTC", at) !== key) return key;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...(withWeekday ? { weekday: "long" as const } : {}),
    month: "long", day: "numeric", year: "numeric",
  }).format(at);
}

/** The closures still ahead of the business, oldest first. */
function upcomingClosures(
  closures: Closure[] | undefined,
  tz: string | null | undefined,
  at: Date,
): Closure[] {
  if (!closures?.length) return [];
  // No zone means we do not know what day it is there. Err toward stating a
  // closure a day longer rather than hiding one that is live.
  const today = (tz && dateKeyInZone(tz, at)) || dateKeyInZone("UTC", new Date(at.getTime() - 86400000));
  if (!today) return closures;
  return closures
    .filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function closureLines(closures: Closure[]): string[] {
  return closures.map((c) => {
    const when = c.until && c.until !== c.date && c.until > c.date
      ? `${labelDate(c.date, false)} – ${labelDate(c.until, false)}`
      : labelDate(c.date, true);
    return c.note ? `${when} — ${c.note}` : when;
  });
}

/** Is the business shut on the date `at` falls on, in its own zone? */
function closedToday(
  closures: Closure[] | undefined,
  tz: string | null | undefined,
  at: Date,
): Closure | null {
  if (!closures?.length || !tz) return null;
  const today = dateKeyInZone(tz, at);
  if (!today) return null;
  return closures.find((c) => {
    const end = c.until && c.until >= c.date ? c.until : c.date;
    return c.date <= today && today <= end;
  }) ?? null;
}

const NO_CLOCK =
  "You do not know today's date or the current time. If a customer asks whether the business is open right now, or about today or tomorrow, state the opening hours and let them compare — never guess which day it is.";

/**
 * The current moment, in the business's own timezone.
 *
 * Deliberately NOT part of composeSystemPrompt. That output is cached with the
 * request; this changes every minute, and folding it in would evict the whole
 * business profile from the prompt cache on every single message. It belongs
 * in its own uncached block, next to the lead note that changes per contact.
 *
 * The timezone is `tenants.timezone` — the one the metrics RPCs and the Today
 * surface already use. There is no second copy of it on the profile.
 */
export function describeNow(
  tz: string | null | undefined,
  now: Date = new Date(),
  /**
   * The workspace's closures, so a shut day is stated HERE.
   *
   * It matters that it is here and not only in the composed block above. This
   * is the last thing the model reads, and on a closure day the weekly grid
   * says open while the closure list says shut. Leaving the tie to block order
   * would decide the single highest-stakes question — "are you open today?" —
   * by accident.
   */
  closures?: Closure[],
): string {
  if (!tz) return NO_CLOCK;
  try {
    const stamp = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    }).format(now);
    const shut = closedToday(closures, tz, now);
    const today = shut
      ? ` The business is CLOSED today${shut.note ? ` — ${shut.note}` : ""}, whatever the weekly hours say. Do not offer today; offer the next day it is open.`
      : "";
    return `Right now it is ${stamp} (${tz}).${today} Use this for anything about today, tomorrow, or whether the business is open at this moment — compare it against the opening hours and the closed dates, and treat a closed date as final.`;
  } catch {
    // An unknown IANA zone throws. A wrong clock is worse than no clock.
    return NO_CLOCK;
  }
}

export function composeSystemPrompt(
  base: { business_name: string; phone_display: string; booking_link: string },
  profile: BusinessProfile,
  channel: "whatsapp" | "voice" = "whatsapp",
  /** IANA zone from `tenants.timezone`, so stated hours are unambiguous. */
  tz?: string | null,
  /**
   * Only used to drop closures that have already passed.
   *
   * No cron, no nightly prune: the composer already runs per message and
   * already knows the zone, so "has this gone by?" is a string comparison.
   * Rows that have passed stay in the config and simply stop being said.
   */
  now: Date = new Date(),
): string {
  const s: string[] = [];
  const medium = channel === "voice" ? "on the phone" : "over WhatsApp";
  s.push(`You are the assistant for ${base.business_name}, answering customers ${medium}.`);
  if (profile.tone) s.push(`Tone: ${profile.tone}`);
  if (profile.languages?.length) s.push(`You speak: ${profile.languages.join(", ")}.`);

  if (profile.address) s.push(`\nAddress: ${profile.address}`);
  s.push(`Phone: ${base.phone_display}`);
  s.push(`Booking link: ${base.booking_link}`);

  const hrs = hoursLines(profile.hours);
  if (hrs.length) {
    // "09:30–18:00" is not a fact until you say where. A customer calling from
    // another state gets a straight answer either way; the model needs the zone
    // to reconcile these with the clock it is given separately.
    const where = tz ? ` (all times ${tz})` : "";
    s.push(`\nOpening hours${where}:\n${hrs.map((l) => `- ${l}`).join("\n")}`);
  }

  // EVERY upcoming closure, not the first handful. A cap here and a larger cap
  // on the schema is a silent divergence between what an owner can store and
  // what the receptionist will ever say — and because the list is sorted
  // oldest-first, the ones a cap drops are the furthest out: exactly the dates
  // customers book against months ahead.
  const closed = closureLines(upcomingClosures(profile.closures, tz, now));
  if (closed.length) {
    s.push(
      `\nClosed on these dates, whatever the opening hours above say:\n${closed
        .map((l) => `- ${l}`)
        .join("\n")}\nIf someone asks about one of these dates, say the business is closed that day and offer the next day it is open.`,
    );
  }

  if (profile.services?.length) {
    const lines = profile.services.map((sv) => {
      const bits = [sv.name];
      if (sv.duration_min) bits.push(`about ${sv.duration_min} minutes`);
      if (sv.price_note) bits.push(sv.price_note);
      return `- ${bits.join(" — ")}`;
    });
    s.push(`\nServices:\n${lines.join("\n")}`);
  }

  // HOW to hand off, not just when — and unconditionally, because the product
  // promise depends on it.
  //
  // The composer told the model WHEN to fetch a human and never how. The only
  // mechanism the runtime honours is the literal [[HUMAN]] token appended to a
  // reply, and that was taught nowhere except inside one salon's hand-written
  // prose. So a composed prompt — the only kind a new workspace can get —
  // produced a receptionist that answers "let me get someone for you" and does
  // nothing: no escalation row, no pause, no staff email, no row on Today. The
  // core promise, that anything it should not decide reaches a person, silently
  // did not exist. It is latent for the live tenant too: her prompt carries the
  // token only until she writes her own extra instructions.
  //
  // WhatsApp only. On the phone there is no token to emit — Retell has its own
  // transfer tool — and a model reading "[[HUMAN]]" aloud to a caller is worse
  // than no handoff at all.
  if (channel === "whatsapp") {
    const when = profile.escalate_when?.length
      ? `\n${profile.escalate_when.map((e) => `- ${e}`).join("\n")}`
      : "";
    s.push(
      `\nHanding the conversation to a person:\n` +
        `Put the exact token [[HUMAN]] at the very end of your reply. It is removed ` +
        `before the customer sees it, and it is the only thing that alerts a human — ` +
        `saying you will fetch someone does nothing on its own. Write the reply you ` +
        `would normally send, then add the token.\n` +
        `Do this whenever the customer asks for a person, is upset, or asks something ` +
        `these instructions do not cover${when ? ", and whenever:" : "."}${when}`,
    );
  } else if (profile.escalate_when?.length) {
    s.push(`\nHand the conversation to a person when:\n${profile.escalate_when.map((e) => `- ${e}`).join("\n")}`);
  }

  if (profile.extra_instructions?.trim()) {
    // A business's own prose almost always restates the address, the hours or
    // the services. Once a form fills those in structurally there are two
    // sources for one fact, and they DID disagree on a live line: the grid
    // said open Sunday, the prose said closed Sunday, and nothing told the
    // receptionist which to believe. The fields above are the ones an owner
    // can see and correct in one click, so those are the ones that win.
    // Named from what was ACTUALLY emitted above, not from a fixed list. The
    // sentence used to say "the address, hours or services above" whatever was
    // there — so a profile carrying only closures pointed the model at three
    // things the prompt did not contain, and never mentioned the one it did.
    const above = [
      profile.address ? "address" : "",
      hrs.length ? "hours" : "",
      closed.length ? "closed dates" : "",
      profile.services?.length ? "services" : "",
    ].filter(Boolean);
    const stated = above.length > 0;
    const text = profile.extra_instructions.trim();
    // This block is often a prompt that was written for ONE channel before the
    // business had fields — Melany's opens "You are the WhatsApp assistant".
    // Read down a phone line that is a false identity statement, and the fix
    // is not to strip it (whose sentence would we delete?) but to say where it
    // came from. The channel line below and the rules after it still win.
    const header = [
      stated
        ? `Further instructions from the business. Where these disagree with the ${joinList(above)} above, the details above are current and correct.`
        : "",
      channel === "voice"
        ? "Some of it was written for text conversations; you are on a phone call."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    s.push(header ? `\n${header}\n${text}` : `\n${text}`);
  }

  // Medium, not facts. A phone caller cannot re-read a paragraph.
  s.push(
    channel === "voice"
      ? "\nYou are speaking aloud. Keep answers to one or two sentences, never read a URL out character by character, and offer to text the booking link instead."
      : "\nKeep replies short enough to read on a phone. Send the booking link rather than describing how to book.",
  );

  // LAST, and never optional.
  const g = profile.guardrails ?? {};
  const rules: string[] = [];
  if (g.never_quote_prices !== false) {
    rules.push("Never quote or confirm a price. Say it is quoted in person or at a consult, and offer the booking link.");
  }
  if (g.never_confirm_booking !== false) {
    rules.push("Never promise or confirm an appointment yourself. Booking happens on the booking link or with staff.");
  }
  if (g.disclose_ai !== false) {
    rules.push("If asked whether you are a bot, a person, or AI, say plainly that you are the business's automated assistant and offer to bring in a person.");
  }
  if (rules.length) s.push(`\nRules you must follow:\n${rules.map((r) => `- ${r}`).join("\n")}`);

  return s.join("\n");
}

/**
 * The instructions this workspace's receptionist should actually receive.
 *
 * ONE resolver, so no caller has to remember the precedence. A workspace that
 * has filled in its profile gets a prompt composed from those facts; one that
 * has not keeps the prompt it already had, byte for byte.
 *
 * That fallback is the whole reason this can ship: Melany's hand-written
 * prompt is live and answering real customers, and a migration that changed
 * what her receptionist says the moment the code deployed would be a
 * behaviour change nobody asked for.
 */
export function resolveSystemPrompt(
  brain: BrainConfig,
  channel: "whatsapp" | "voice" = "whatsapp",
  /** IANA zone from `tenants.timezone`. Labels the hours; never a second copy. */
  tz?: string | null,
  /** Only used to drop closures that have already passed. */
  now: Date = new Date(),
): string {
  if (!hasProfile(brain.profile)) return brain.system_prompt;
  const profile = brain.profile as BusinessProfile;
  // NOTHING a workspace already had may be lost by filling in a form.
  //
  // Filling in only the opening hours switched a live receptionist from a
  // 5,000-character hand-written prompt to a 700-character composed one: the
  // address, every service and duration, and the languages it spoke all
  // disappeared, silently, on a line real customers were texting. The profile
  // was doing what it was told; the DEFAULT was wrong.
  //
  // So an existing prompt is carried as extra instructions until the owner
  // has written their own. Once they have, theirs wins — they have seen the
  // old text in the form and decided what to keep.
  const carried = profile.extra_instructions?.trim()
    ? profile
    : { ...profile, extra_instructions: brain.system_prompt };
  return composeSystemPrompt(brain, carried, channel, tz, now);
}
