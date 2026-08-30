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
export const ROLE_PERMS: Record<Role, { approve: boolean; autonomy: boolean; disconnect: boolean; billing: boolean; team: boolean }> = {
  owner:    { approve: true,  autonomy: true,  disconnect: true,  billing: true,  team: true },
  operator: { approve: true,  autonomy: true,  disconnect: false, billing: false, team: false },
  viewer:   { approve: false, autonomy: false, disconnect: false, billing: false, team: false },
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

export const HoursSchema = z
  .object({
    /** "09:00". Absent or null = closed that day, which is a real answer. */
    open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  })
  .strict();

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
function hoursLines(hours: Record<string, Hours> | undefined): string[] {
  if (!hours) return [];
  const spans = DAYS.map((d) => {
    const h = hours[d];
    const open = h?.open ?? null;
    const close = h?.close ?? null;
    return { day: d, text: open && close ? `${open}–${close}` : "Closed" };
  });
  // Collapse consecutive days that share the same hours — a seven-line block
  // is harder to read aloud AND longer in a prompt, for no extra information.
  const out: string[] = [];
  let i = 0;
  while (i < spans.length) {
    let j = i;
    while (j + 1 < spans.length && spans[j + 1].text === spans[i].text) j++;
    const label =
      i === j ? DAY_LABEL[spans[i].day] : `${DAY_LABEL[spans[i].day]}–${DAY_LABEL[spans[j].day]}`;
    out.push(`${label}: ${spans[i].text}`);
    i = j + 1;
  }
  return out;
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
  const statedHours = !!p.hours && Object.values(p.hours).some((h) => h?.open && h?.close);
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
export function describeNow(tz: string | null | undefined, now: Date = new Date()): string {
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
    return `Right now it is ${stamp} (${tz}). Use this for anything about today, tomorrow, or whether the business is open at this moment — compare it against the opening hours.`;
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

  if (profile.services?.length) {
    const lines = profile.services.map((sv) => {
      const bits = [sv.name];
      if (sv.duration_min) bits.push(`about ${sv.duration_min} minutes`);
      if (sv.price_note) bits.push(sv.price_note);
      return `- ${bits.join(" — ")}`;
    });
    s.push(`\nServices:\n${lines.join("\n")}`);
  }

  if (profile.escalate_when?.length) {
    s.push(`\nHand the conversation to a person when:\n${profile.escalate_when.map((e) => `- ${e}`).join("\n")}`);
  }

  if (profile.extra_instructions?.trim()) {
    // A business's own prose almost always restates the address, the hours or
    // the services. Once a form fills those in structurally there are two
    // sources for one fact, and they DID disagree on a live line: the grid
    // said open Sunday, the prose said closed Sunday, and nothing told the
    // receptionist which to believe. The fields above are the ones an owner
    // can see and correct in one click, so those are the ones that win.
    const stated = !!(profile.address || hrs.length || profile.services?.length);
    const text = profile.extra_instructions.trim();
    // This block is often a prompt that was written for ONE channel before the
    // business had fields — Melany's opens "You are the WhatsApp assistant".
    // Read down a phone line that is a false identity statement, and the fix
    // is not to strip it (whose sentence would we delete?) but to say where it
    // came from. The channel line below and the rules after it still win.
    const header = [
      stated
        ? "Further instructions from the business. Where these disagree with the address, hours or services above, the details above are current and correct."
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
  return composeSystemPrompt(brain, carried, channel, tz);
}
