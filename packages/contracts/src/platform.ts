/**
 * The back office: every workspace, and what is up with each one.
 *
 * WHY THIS EXISTS. There was no cross-tenant view at all. Every support
 * question — "why isn't my receptionist answering?" — was answered by writing
 * SQL by hand, once, unrepeatably, by the one person who knew the schema. At
 * four workspaces that is merely slow. At four hundred it is the reason nobody
 * else can ever answer a customer.
 *
 * WHY IT IS NOT A TABLE OF COLUMNS. A list of states is another thing to
 * interpret, and interpreting it is the work. So every workspace gets a VERDICT
 * — one of ten, each meaning a different next action — and one sentence saying
 * what that action is. The list sorts itself so the ones needing a person are
 * at the top, and a support shift is "work down the page" rather than "know
 * which column matters".
 *
 * WHY THE WORDS ARE THE CUSTOMER'S. `textingWords` and `receptionistOn` are the
 * same functions the workspace's own Setup page and billing rows call. Support
 * reading a different rendering of the same facts is how you get two people on
 * a call disagreeing about what the product says — so there is one rendering,
 * and this file adds only the cross-workspace judgement that nobody else needs.
 */
import { agoWords } from "./time";
import { textingWords } from "./setup";
import { receptionistOn, maySpend, type BillingMode, type BillingStatus } from "./billing";
import { formatPhoneDisplay } from "./phone";

/** One workspace as `platform_overview()` returns it. Every field is a fact something else already recorded. */
export interface PlatformTenantDto {
  tenant_id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  created_at: string;
  members: number;
  billing_mode: string | null;
  billing_status: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  line_e164: string | null;
  line_kind: string | null;
  voice_state: string | null;
  sms_state: string | null;
  reg_step: string | null;
  reg_mock: boolean | null;
  reg_sole_prop: boolean | null;
  line_error: string | null;
  whatsapp_number: string | null;
  whatsapp_active: boolean | null;
  voice_number: string | null;
  voice_active: boolean | null;
  last_inbound_at: string | null;
}

/**
 * What is up with a workspace, as one word — and each word is a different
 * NEXT ACTION, which is the only reason to have more than two.
 *
 *   broken         something failed and a person at Chanlytics owns it
 *   billing        money needs attention and the receptionist is at risk
 *   rehearsal      texting is filed against the test registry: it looks
 *                  registered, delivers nothing, and expires in thirty days
 *   stalled        set up long enough ago that nothing answering is a problem
 *   waiting_owner  the next move is theirs, and they may not know it
 *   quiet          answering, and nobody has reached them in a fortnight
 *   new            too young for any of the above to mean anything
 *   live           answering, and heard from
 *   paused         the workspace itself is paused
 *   test           not a customer
 */
export type PlatformVerdict =
  | "broken" | "billing" | "rehearsal" | "stalled" | "waiting_owner"
  | "quiet" | "new" | "live" | "paused" | "test";

export interface PlatformVerdictWords {
  label: string;
  tone: "ok" | "warn" | "danger" | "accent" | "muted";
  /** Higher sorts first: the page is worked from the top down. */
  rank: number;
}

export const PLATFORM_VERDICTS: Record<PlatformVerdict, PlatformVerdictWords> = {
  broken:        { label: "Broken",        tone: "danger", rank: 100 },
  billing:       { label: "Billing",       tone: "danger", rank: 90 },
  rehearsal:     { label: "Rehearsal",     tone: "warn",   rank: 80 },
  stalled:       { label: "Stalled",       tone: "warn",   rank: 70 },
  waiting_owner: { label: "Waiting on them", tone: "accent", rank: 60 },
  quiet:         { label: "Quiet",         tone: "warn",   rank: 40 },
  new:           { label: "New",           tone: "accent", rank: 20 },
  live:          { label: "Live",          tone: "ok",     rank: 10 },
  paused:        { label: "Paused",        tone: "muted",  rank: 5 },
  test:          { label: "Test",          tone: "muted",  rank: 0 },
};

export interface PlatformRowVM {
  tenantId: string;
  slug: string;
  name: string;
  verdict: PlatformVerdict;
  /** What to do about it, or why there is nothing to do. One line, always. */
  sentence: string;
  /** The four facts that answer most questions, each already in words. */
  facts: { paying: string; answering: string; texting: string; heard: string };
  /** How long they have been a workspace. */
  age: string;
  members: number;
}

const DAY = 86_400_000;
/** Younger than this and "nothing is set up" is not yet a fact about anything. */
export const PLATFORM_NEW_DAYS = 1;
/** Answering, but nobody has reached them: long enough to be worth a call, short enough to still matter. */
export const PLATFORM_QUIET_DAYS = 14;

const at = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
};

/** The states that mean a person at Chanlytics has it, not the customer. */
const OURS_TO_FIX = ["failed"];
/** The states that mean the next move is the owner's. */
const THEIRS_TO_FIX = ["needs_record", "otp_waiting", "rejected"];

function verdictFor(r: PlatformTenantDto, nowMs: number): PlatformVerdict {
  if (r.status === "test") return "test";
  if (r.status === "paused") return "paused";

  const mode = (r.billing_mode ?? "direct") as BillingMode;
  const status = (r.billing_status ?? "none") as BillingStatus;
  const answering = r.voice_active === true || r.whatsapp_active === true;
  const age = nowMs - (at(r.created_at) ?? nowMs);

  // Broken first: a failed line or a suspended registration is ours, and a
  // customer waiting on us must never be filed under anything softer.
  if (r.voice_state === "failed" || OURS_TO_FIX.includes(r.sms_state ?? "")) return "broken";

  // Money next, but only where it can actually stop the receptionist. A `none`
  // that is simply pre-card is `waiting_owner`, below: unpaid and past due are
  // the ones with a clock on them.
  if (mode === "stripe" && !receptionistOn(status)) return "billing";
  if (mode === "stripe" && status === "past_due") return "billing";

  // A rehearsal filing reports itself as approved and delivers nothing. It is
  // the state most likely to be mistaken for working, so it outranks the
  // states that merely look unfinished.
  if (r.reg_mock === true) return "rehearsal";

  if (!answering) return age > PLATFORM_NEW_DAYS * DAY ? "stalled" : "new";
  if (THEIRS_TO_FIX.includes(r.sms_state ?? "")) return "waiting_owner";
  if (mode === "stripe" && !maySpend(mode, status)) return "waiting_owner";

  const heard = at(r.last_inbound_at);
  if (heard === null) return age > PLATFORM_QUIET_DAYS * DAY ? "quiet" : "new";
  if (nowMs - heard > PLATFORM_QUIET_DAYS * DAY) return "quiet";
  return "live";
}

function sentenceFor(r: PlatformTenantDto, verdict: PlatformVerdict, nowMs: number): string {
  const heard = at(r.last_inbound_at);
  const quietFor = heard === null ? null : Math.floor((nowMs - heard) / DAY);
  switch (verdict) {
    case "broken":
      return r.line_error
        ? `${r.line_error}${r.reg_step ? ` (stopped at ${r.reg_step})` : ""}`
        : "Their line stopped and said nothing. A person at Chanlytics has to look.";
    case "billing":
      return r.billing_status === "past_due"
        ? "A payment failed. The receptionist still answers, and will not once Stripe gives up."
        : `Not subscribed (${r.billing_status ?? "no status"}) — the receptionist is paused for them.`;
    case "rehearsal":
      return "Texting is filed against the test registry: it reports itself approved, delivers nothing, and expires thirty days after filing.";
    case "stalled":
      return `Set up ${agoWords(at(r.created_at) ?? nowMs, nowMs)} and nothing answers yet${r.members <= 1 ? ", with one person in the workspace" : ""}.`;
    case "waiting_owner":
      return textingWords({ sms_state: r.sms_state ?? "none", reg_mock: r.reg_mock ?? false, reg_sole_prop: r.reg_sole_prop ?? false }).sentence;
    case "quiet":
      return quietFor === null
        ? "Answering, and no customer has ever reached them."
        : `Answering, and no customer has reached them in ${quietFor} days.`;
    case "new":
      return `Signed up ${agoWords(at(r.created_at) ?? nowMs, nowMs)}, still setting up.`;
    case "live":
      return `Answering; last heard from ${heard === null ? "never" : agoWords(heard, nowMs)}.`;
    case "paused":
      return "The workspace is paused. Nothing answers, by design.";
    case "test":
      return "Not a customer — a test workspace.";
  }
}

/** The four facts, in words, so the page renders strings rather than deciding anything. */
function factsFor(r: PlatformTenantDto, nowMs: number): PlatformRowVM["facts"] {
  const mode = (r.billing_mode ?? null) as BillingMode | null;
  const status = (r.billing_status ?? null) as BillingStatus | null;
  const paying =
    mode === null ? "No arrangement"
    : mode === "direct" ? "Invoiced"
    : status === "trialing" && r.trial_end ? `Trial to ${r.trial_end.slice(0, 10)}`
    : status ?? "unknown";

  const on = [r.voice_active ? "phone" : null, r.whatsapp_active ? "WhatsApp" : null].filter(Boolean);
  const answering =
    on.length ? on.join(" + ")
    : r.voice_state === "provisioning" ? "Getting a number"
    : r.voice_state === "failed" ? "Line failed"
    : "Nothing yet";

  const texting =
    !r.line_e164 ? "No line"
    : r.sms_state === "active" ? (r.reg_sole_prop ? "On (sole proprietor)" : "On")
    : r.reg_mock ? "Rehearsal"
    : (r.sms_state ?? "none").replace(/_/g, " ");

  const at_ = at(r.last_inbound_at);
  return { paying, answering, texting, heard: at_ === null ? "Never" : agoWords(at_, nowMs) };
}

/**
 * Every workspace, judged and sorted: the ones needing a person first, and
 * inside a verdict the one waiting longest first.
 *
 * Pure. The route hands it the RPC's rows and the page renders what comes back
 * — no interpretation on either side, so what support sees can be tested.
 */
export function platformRows(rows: readonly PlatformTenantDto[], nowMs = Date.now()): PlatformRowVM[] {
  return rows
    .map((r) => {
      const verdict = verdictFor(r, nowMs);
      return {
        tenantId: r.tenant_id,
        slug: r.slug,
        name: r.name,
        verdict,
        sentence: sentenceFor(r, verdict, nowMs),
        facts: factsFor(r, nowMs),
        age: agoWords(at(r.created_at) ?? nowMs, nowMs),
        members: r.members,
      };
    })
    .sort((a, b) => {
      const byRank = PLATFORM_VERDICTS[b.verdict].rank - PLATFORM_VERDICTS[a.verdict].rank;
      if (byRank !== 0) return byRank;
      return a.name.localeCompare(b.name);
    });
}

/** The one line at the top: what the whole platform looks like right now. */
export function platformSummary(rows: readonly PlatformRowVM[]): { total: number; needsUs: number; needsThem: number; live: number; sentence: string } {
  const customers = rows.filter((r) => r.verdict !== "test");
  const needsUs = customers.filter((r) => r.verdict === "broken" || r.verdict === "rehearsal").length;
  const needsThem = customers.filter((r) => r.verdict === "billing" || r.verdict === "waiting_owner" || r.verdict === "stalled").length;
  const live = customers.filter((r) => r.verdict === "live").length;
  const parts: string[] = [`${customers.length} workspace${customers.length === 1 ? "" : "s"}`, `${live} live`];
  if (needsUs) parts.push(`${needsUs} on us`);
  if (needsThem) parts.push(`${needsThem} on them`);
  return { total: customers.length, needsUs, needsThem, live, sentence: parts.join(" · ") };
}

/** A number as the back office shows it, or a dash. Support reads these aloud on calls. */
export function platformNumber(e164: string | null | undefined): string {
  return formatPhoneDisplay(e164) ?? "—";
}
