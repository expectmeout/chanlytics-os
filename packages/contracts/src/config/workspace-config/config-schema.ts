/**
 * Control plane types (PRD E1/E3/E4) — the single source every boundary
 * imports: the Settings form, the /v1 routes, and the edge runtime all parse
 * the same schemas, so an option that exists in the UI exists in the runtime
 * by construction (anti-junk rule R1).
 *
 * This module holds the whole tenant_config column: its sections, the rules only a save has
 * (TenantConfigWriteSchema) and the parse the runtime reads it with. The sections' own parts are
 * business-profile.ts and brain-config.ts beside it.
 */
import { feedProblemWords, feedUrlOk } from "../../calendar/feed-url";
import { normalizeEmail } from "../../shared/email-address";
import { z } from "zod";
import { keysLeftOut, refuseUnknownFields, withKeysLeftOut } from "../unknown-keys";
import { BrainConfigSchema } from "./brain-config";
import type { Closure, DAYS, Hours } from "./business-profile";

export const NotificationsConfigSchema = z
  .object({
    escalation_emails: z.array(z.string().email()).min(1).max(10),
    from: z.string().max(200).optional(),
  })
  .strip();
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;

/**
 * The whole tenant_config.config column. Sections are optional — a tenant with
 * no brain section is a tenant whose receptionist does not speak (persist +
 * escalate only). Safe-by-default beats a leaked persona.
 *
 * NOTHING ON THE READ PATH IS `.strict()`, at the top level or in a section.
 *
 * The edge and the dashboard are separate Vercel projects that deploy
 * independently. With a strict read, the first dashboard deploy to write a new
 * section or field — `guardrails`, a per-tenant allowlist, anything — would be
 * rejected in its entirety by the older edge still running beside it. The
 * receptionist would go completely silent on a live line, and it would be
 * logged identically to "no brain profile configured": a total mute that reads
 * as a configuration absence. (The sections stayed strict until 27 Sep 2026.)
 *
 * So an older edge leaves out a key it has never heard of, at any depth, keeps
 * answering with the persona it does understand, and says what it left out
 * (parseTenantConfigResult's `ignored`). Strictness stays where it catches real
 * mistakes: on the way IN (TenantConfigWriteSchema), where a typo inside a
 * section is refused by name, not saved as a field the runtime never applies.
 */
/**
 * The calendar the receptionist may READ. An iCal address — what any booking
 * tool that syncs to Google, Apple or Outlook produces — never credentials to
 * write with. Nothing is ever booked from here; the booking link does that,
 * whichever tool is behind it.
 */
export const CalendarConfigSchema = z
  .object({
    ical_url: z
      .string()
      .max(2000)
      .refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address"),
  })
  .strip();
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;

/**
 * Opt-in abilities, off unless the workspace turns them on.
 *
 * `vision`: the receptionist looks at photos customers send over WhatsApp and
 * answers them like words, under every rule it already follows. Off, a photo
 * is acknowledged and handed to a person, as before.
 */
export const FeaturesConfigSchema = z.object({ vision: z.boolean().optional() }).strip();
export type FeaturesConfig = z.infer<typeof FeaturesConfigSchema>;

export const TenantConfigSchema = z.object({
  brain: BrainConfigSchema.optional(),
  notifications: NotificationsConfigSchema.optional(),
  calendar: CalendarConfigSchema.optional(),
  features: FeaturesConfigSchema.optional(),
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

/** A day of the week by its whole name, the one table: the write rules', the composer's and the first run's. */
export const DAY_NAMES: Record<(typeof DAYS)[number], string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
const DAY_NAME: Record<string, string> = DAY_NAMES;

/**
 * What is wrong with one day of the week, in the owner's words, each with where in the day it is. The write rules'
 * day check (checkDay) and anything that builds a day from elsewhere (google.ts hoursFromGoogle) ask this, so a day
 * is judged by one set of rules wherever it comes from. Empty when the day is one the record holds.
 */
export function dayProblems(h: Hours, day: string): Array<{ path: Array<string | number>; message: string }> {
  const name = DAY_NAME[day] ?? day;
  const out: Array<{ path: Array<string | number>; message: string }> = [];
  const open = h.open ?? undefined;
  const close = h.close ?? undefined;
  if (!!open !== !!close) {
    out.push({
      path: [open ? "close" : "open"],
      message: `${name} needs both an opening and a closing time, or neither.`,
    });
  }
  if (open && close && close <= open) {
    out.push({ path: ["close"], message: `${name} closes at or before it opens.` });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY) {
    out.push({ path: ["intervals"], message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY} shifts.` });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      out.push({ path: ["intervals", n, "close"], message: `${name}: a shift has to close after it opens.` });
    }
  });
  // Overlap, not adjacency. Two shifts that TOUCH — 09:00-13:00 and
  // 13:00-19:00 — are an ordinary two-stylist day, and rejecting them would
  // refuse a legitimate entry. Compared on sorted copies so the owner is not
  // told their day is wrong merely because they typed the afternoon first.
  const sorted = [...iv].sort((a, b) => (a.open < b.open ? -1 : a.open > b.open ? 1 : 0));
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      out.push({ path: ["intervals", n, "open"], message: `${name}: two shifts overlap.` });
    }
  }
  return out;
}

function checkDay(h: Hours, day: string, ctx: z.RefinementCtx): void {
  for (const p of dayProblems(h, day)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["brain", "profile", "hours", day, ...p.path],
      message: p.message,
    });
  }
}

function checkClosure(c: Closure, n: number, ctx: z.RefinementCtx): void {
  const at = (...rest: (string | number)[]) => ["brain", "profile", "closures", n, ...rest];
  // The read regex accepts 2026-11-31. Caught here so it never reaches a
  // renderer that would have to print it raw to avoid naming the wrong day.
  if (!isRealDate(c.date)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: at("date"),
      message: `${c.date} is not a date on the calendar.`,
    });
  }
  if (c.until && !isRealDate(c.until)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: at("until"),
      message: `${c.until} is not a date on the calendar.`,
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: at("until"),
      message: "A closure cannot end before it starts.",
    });
  }
}

/** The rules only a save has, over the shape the read keeps (TenantConfigWriteSchema). */
const WriteRules = TenantConfigSchema.superRefine((cfg, ctx) => {
  // The feed's address: only the public internet, the rule every fetch of it keeps (feed-url.ts).
  if (cfg.calendar && !feedUrlOk(cfg.calendar.ical_url)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["calendar", "ical_url"],
      message: feedProblemWords("address") ?? "Not an address the receptionist may read.",
    });
  }
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

/**
 * The same config, with the rules that only apply on the way IN, and none of
 * the fields inside a section that the read would leave out (unknown-keys.ts).
 *
 * Wrapping TenantConfigSchema rather than replacing it, so the shape and the
 * lenience stay defined in exactly one place and this can only ever be
 * stricter.
 */
export const TenantConfigWriteSchema = z
  .unknown()
  .superRefine((raw, ctx) => refuseUnknownFields(TenantConfigSchema, raw, ctx))
  .pipe(WriteRules);

/** A config as read, with the keys it left out (`ignored`, dotted paths); or why it could not be read at all. */
export type TenantConfigParse = { ok: true; config: TenantConfig; ignored: string[] } | { ok: false; issues: string[] };

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
  if (r.success) return { ok: true, config: r.data, ignored: keysLeftOut(raw, r.data).map((p) => p.join(".")) };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/**
 * What a save writes: the config the page sent, with every key of the stored config this build's read left out put
 * back where it was, at any depth (withKeysLeftOut). The page's read never showed them, so the page cannot have meant
 * to delete them: a dashboard rolled back behind the edge, or one tab older than the deploy, saved the whole column and
 * deleted what a newer build wrote (the scorecard's defect 19). A stored config the read refuses keeps nothing: there
 * is no telling its known keys from its unknown ones, and the save replaces it as it always did.
 */
export function withStoredKeysKept(sent: TenantConfig, stored: unknown): TenantConfig {
  const read = TenantConfigSchema.safeParse(stored ?? {});
  if (!read.success) return sent;
  return withKeysLeftOut(sent, stored, read.data) as TenantConfig;
}

/** Whether a workspace's receptionist is set up: none yet, set up, or a config the parser refused. */
export type ReceptionistState = "none" | "set" | "broken";

/**
 * The one test of whether a receptionist is set up, for Setup's read, the first run's Check and the first
 * receptionist's route alike: a config the parser refuses is its own state, since only Chanlytics repairs one, and a
 * parsed config holds a receptionist when it holds a brain. No config at all reads as none.
 */
export function receptionistOf(parsed: TenantConfigParse | null): ReceptionistState {
  if (parsed && !parsed.ok) return "broken";
  return parsed?.config.brain ? "set" : "none";
}

/** Convenience for callers that genuinely cannot act on the difference. */
export function parseTenantConfig(raw: unknown): TenantConfig | null {
  const r = parseTenantConfigResult(raw);
  return r.ok ? r.config : null;
}

/**
 * A new workspace's first alert address: its creator's. Without one, the edge's
 * chooseAddressing (lib/ops/notify.ts) sends every "a customer needs you" to the
 * platform, redacted, and the owner is never told.
 *
 * Returns the config to save, or null when there is nothing to do: a config that
 * already names its addresses, one that will not parse, or an address the write
 * schema refuses -- saved, a refused address would make the whole config
 * unreadable, and the receptionist silent.
 */
export function withFirstAlertAddress(config: unknown, email: string | null | undefined): TenantConfig | null {
  const current = parseTenantConfigResult(config ?? {});
  if (!current.ok || current.config.notifications) return null;
  const address = normalizeEmail(email);
  if (!address) return null;
  const next = TenantConfigWriteSchema.safeParse({
    ...current.config,
    notifications: { escalation_emails: [address] },
  });
  return next.success ? withStoredKeysKept(next.data, config) : null;
}
