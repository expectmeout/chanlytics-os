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
import { textingWords, lineStuckProvisioning, type LineDto } from "./setup";
import { receptionistOn, maySpend, whyCannotSpend, type BillingMode, type BillingStatus } from "./billing";
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

/** Whether the money, on its own, is the thing that needs a person. */
function billingBites(mode: BillingMode, status: BillingStatus): boolean {
  if (mode !== "stripe") return false;
  // `past_due` still answers -- Stripe has not given up yet -- which is exactly
  // why it needs a person before it becomes `unpaid`.
  return !receptionistOn(status) || status === "past_due";
}

/**
 * What is up with this workspace.
 *
 * THE ORDER IS THE DESIGN, and it was wrong twice on the first pass:
 *
 *   `paused` came first, and `paused` is what the BILLING APPLIER writes -- it
 *   is the only thing in this codebase that ever sets tenants.status to it
 *   (edge/lib/billing.ts via tenantStatusFor). So every workspace whose card
 *   stopped working read "Paused. Nothing answers, by design", which is the
 *   opposite of true and files a paying customer's emergency under a shrug.
 *
 *   `!answering` came before the owner-action states, so a workspace whose
 *   registration the carriers REFUSED read "nothing answers yet" -- burying the
 *   one sentence support needed, which is the carriers' reason.
 *
 * The order now runs most-urgent to least, and each check is written so the one
 * below it can assume the one above did not fire.
 */
function verdictFor(r: PlatformTenantDto, nowMs: number): PlatformVerdict {
  // Not a customer: nothing below means anything about it.
  if (r.status === "test") return "test";

  const mode = (r.billing_mode ?? "direct") as BillingMode;
  const status = (r.billing_status ?? "none") as BillingStatus;
  const answering = r.voice_active === true || r.whatsapp_active === true;
  const age = nowMs - (at(r.created_at) ?? nowMs);

  // Ours: a failed line or a suspended registration. A customer waiting on US
  // must never be filed under anything softer.
  if (r.voice_state === "failed" || OURS_TO_FIX.includes(r.sms_state ?? "")) return "broken";

  // Money, where it can actually stop the receptionist -- and BEFORE `paused`,
  // because a billing pause arrives as exactly that status.
  if (billingBites(mode, status)) return "billing";

  // Paused for some other reason, then: deliberate, and nothing to chase.
  if (r.status === "paused") return "paused";

  // A rehearsal filing reports itself approved and delivers nothing. It is the
  // state most likely to be mistaken for working, so it outranks everything
  // that merely looks unfinished.
  if (r.reg_mock === true) return "rehearsal";

  // Too young for "nothing is set up" to be a fact about anything. Held above
  // the owner-action states on purpose: `needs_record` is the ordinary state of
  // every workspace on its first day, and calling that "waiting on them" would
  // put the whole signup queue at the top of the page.
  if (!answering && age <= PLATFORM_NEW_DAYS * DAY) return "new";

  // Theirs: a state the owner has to act on, whether or not anything answers
  // yet. A refused registration is the owner's next move even on a workspace
  // that never got its phone line up.
  if (THEIRS_TO_FIX.includes(r.sms_state ?? "")) return "waiting_owner";
  if (mode === "stripe" && !maySpend(mode, status)) return "waiting_owner";

  if (!answering) return "stalled";

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
    case "waiting_owner": {
      // TWO causes reach this verdict, and rendering one sentence for both told
      // a workspace with no card on file that its texting was fine. Each cause
      // gets the owner's own words for that cause.
      const mode = (r.billing_mode ?? "direct") as BillingMode;
      const status = (r.billing_status ?? "none") as BillingStatus;
      if (!THEIRS_TO_FIX.includes(r.sms_state ?? "") && mode === "stripe") {
        return whyCannotSpend(mode, status) ?? "Something about their billing needs them.";
      }
      // The customer's own sentence, plus the carriers' reason where there is
      // one. Setup's version deliberately leaves the reason out -- the owner has
      // it on their texting row -- but the reason is the entire content of a
      // support question, so here it travels with the state.
      const words = textingWords({ sms_state: r.sms_state ?? "none", reg_mock: r.reg_mock ?? false, reg_sole_prop: r.reg_sole_prop ?? false }).sentence;
      return r.line_error ? `${words} — ${r.line_error}` : words;
    }
    case "quiet":
      return quietFor === null
        ? "Answering, and no customer has ever reached them."
        : `Answering, and no customer has reached them in ${quietFor} days.`;
    case "new":
      // `new` is reached two ways: nothing set up yet, or set up and answering
      // with nobody having reached them. "Still setting up" is a lie about the
      // second one.
      return r.voice_active === true || r.whatsapp_active === true
        ? `Answering since ${agoWords(at(r.created_at) ?? nowMs, nowMs)}; no customer has reached them yet.`
        : `Signed up ${agoWords(at(r.created_at) ?? nowMs, nowMs)}, still setting up.`;
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

/* -------------------------------------------------------------------------- *
 * What support may DO to a line, and what each one costs.
 *
 * The back office was read-only in v1 on purpose, and this is the smallest
 * possible step off that: three actions that already exist as edge operations,
 * named one at a time. Never a generic passthrough — a route that forwards an
 * arbitrary `op` is a back door with extra steps.
 *
 * WHY THE COST LIVES HERE. `refile` is two different actions wearing one name,
 * and the difference is money:
 *
 *   a REJECTED campaign  is corrected in place. Twilio assesses the vetting fee
 *                        once per campaign, so an edit is FREE.
 *   a REHEARSAL filing   is replaced by a real one. That is a new brand and a
 *                        new campaign: about $19.50, and a brand cannot be
 *                        withdrawn afterwards.
 *
 * A button that says "$19" when it is free is a button nobody presses; one that
 * says nothing when it is $19 is worse. The judgement is here, where it can be
 * tested, rather than in a page that would have to re-derive it.
 * -------------------------------------------------------------------------- */

export type PlatformLineAction = "retry" | "refile" | "release";

export interface PlatformLineActionVM {
  action: PlatformLineAction;
  label: string;
  /** What it does, in one line. */
  sentence: string;
  /** What it spends, or null when it spends nothing. Said FIRST in any confirmation. */
  cost: string | null;
  /** Cannot be undone. */
  permanent: boolean;
}

/** About a dollar a month for as long as a number is held; the figures are this account's own invoices. */
const NUMBER_MONTHLY = "$1.15 a month";
const REAL_FILING = "about $19.50 once";

/**
 * The actions this line can actually take right now.
 *
 * An action that would be refused is not offered: the edge answers 409 for a
 * retry on a line that is not failed, and for a refile on a filing that stands.
 * Showing a button that is going to be refused teaches somebody to ignore
 * buttons.
 */
export function platformLineActions(
  l: Pick<LineDto, "e164" | "voice_state" | "sms_state" | "reg_mock" | "state_since">,
  nowMs: number = Date.now(),
): PlatformLineActionVM[] {
  const out: PlatformLineActionVM[] = [];

  // A line still SETTING UP past the deadline is the same situation as a failed
  // one and support needs the same button: the saga was killed mid-run (its worst
  // case is three times its own lambda ceiling), so no `catch` ever wrote
  // `failed`. This list offered nothing at all for that row, which is why the only
  // exit anyone had was handing the number back — permanently — and buying another.
  if (l.voice_state === "failed" || lineStuckProvisioning(l, nowMs)) {
    out.push({
      action: "retry",
      label: "Retry setting up",
      sentence: "Resumes the line where it stopped, without repeating the steps that succeeded. The saga reads its own receipts, so nothing is bought twice.",
      // A saga that failed BEFORE the number was bought buys one when it
      // resumes, so this can spend even though it usually does not.
      cost: `If it stopped before the number was bought, this buys one — ${NUMBER_MONTHLY}.`,
      permanent: false,
    });
  }

  if (l.sms_state === "rejected") {
    out.push({
      action: "refile",
      label: "Send the campaign back",
      // It used to say "Correct the business on record first — this sends what is
      // there now", which was true and was the whole problem: nothing verified
      // that anyone had, so a rejection could be answered with the fault that
      // caused it. Both senders now run the same pre-flight, so the honest
      // sentence is that this REFUSES rather than repeats.
      sentence: "Resubmits the campaign to the carriers, free — the vetting fee is charged once per campaign. It refuses, with the reason, if the record or the workspace's name still would not pass review.",
      cost: null,
      permanent: false,
    });
  } else if (l.reg_mock === true) {
    out.push({
      action: "refile",
      label: "File it for real",
      sentence: "Takes the rehearsal off and files a real registration with the carriers. The rehearsal delivers nothing and expires thirty days after it was filed.",
      cost: `${REAL_FILING}, charged to Chanlytics.`,
      permanent: true,
    });
  }

  if (l.e164) {
    out.push({
      action: "release",
      label: "Give the number back",
      sentence: "Releases the number, drops the trunk and forgets the line. Calls keep their history; the routing row is switched off, never deleted.",
      cost: `Stops the ${NUMBER_MONTHLY} this number costs.`,
      permanent: true,
    });
  }
  return out;
}

/** The one line a confirmation leads with: what it costs, then whether it can be undone. */
export function platformActionWarning(a: PlatformLineActionVM): string {
  const parts = [a.cost, a.permanent ? "This cannot be undone." : null].filter(Boolean);
  return parts.length ? parts.join(" ") : "Nothing is spent, and it can be done again.";
}
