/**
 * Every sentence the pages say about a reach-out (Reach out, Part 4): the sheet, what Start did, the approval sheet,
 * Playbooks' row and open row, Templates' email row, and the doors' refusals. The canvas's words with the database's
 * numbers in; a count the database does not hold is never said (interested and booked are Part 5's).
 */
import { clockTime } from "../shared/clock";
import { DOMAIN_RAMP, domainDailyCap } from "../email/sending-domains";
import { nextRunLabel } from "../playbooks/playbook-schedule";
// The one "3 emails" (shared/words.ts), not an eleventh copy of it.
import { plural } from "../shared/words";
import type {
  ReachOutChainDto,
  ReachOutChainReportDto,
  ReachOutReachDto,
  ReachOutRunDto,
  ReachOutStartDto,
} from "./reach-out-dtos";
import { HOLD_DOOR_WORDS, holdDoors, holdWords, type HoldDoor } from "./reach-out-words";

export const REACH_OUT_SHEET_WORDS = {
  sub: "Your email, opened differently for each business, from a domain you own. Whoever writes back lands in your Inbox, and the receptionist drafts the answer.",
  who: "Ready, with a checked address, never written to. Keeps itself current as the search grows.",
  opening:
    "The receptionist writes the opening from the finder's record of each business: why it fit, the reviews, the site, the hours. It never invents a fact; the check before each send holds anything it can't back.",
  stops: "Stops for anyone who writes back on any channel, books, unsubscribes, bounces or says no.",
  stopOne: "To stop writing to one business, mark its lead Said no or Not a fit.",
  first: "Starts today. The first run waits on you. After that, a run gives you thirty minutes to stop it.",
  slotsHint: "click to insert · each is filled per lead, or the email is held",
  foot: "Why they're hearing from you, your address, Unsubscribe",
  footHint: "as the law asks",
  repliesHint: "into your Inbox",
  checkLater: "Every email is checked before it goes. The first run shows what the check held, and waits on you.",
  noDomain: "Add a domain you send from in Settings › Connections › Email first.",
  anotherStep: "Another step",
  anotherStepHint: "· another email",
  remove: "Remove",
  removeNote: "Removes the reach-out and its words. Only before its first email goes; after that, pause it.",
  recheck: "Check the held again",
} as const;

/**
 * The doors' refusals, said once: the database raises these very sentences (00211), and the routes answer them
 * (reach-out-sheet-doors.db.test.mjs holds the two to the same words).
 */
export const REACH_OUT_REFUSALS = {
  exists: "This search has a reach-out already.",
  wrote: "This reach-out has written already. Pause it instead.",
  stepWrote: "That step has written already. Pause the reach-out instead.",
  outOfPlace: "A step is out of its place. Open the reach-out again.",
  notFound: "Reach-out not found.",
  workspaceNotFound: "Workspace not found.",
  oneEmail: "A reach-out has at least one email.",
  /** lead_set_stage's own, when Not a fit finds its lead missing or erased. */
  leadNotFound: "Lead not found.",
  leadGone: "This lead is gone.",
  searchNotFound: "Search not found.",
  domainNotFound: "Domain not found.",
  sendNotFound: "Email not found.",
  runNotFound: "Run not found.",
  runOver: "That run is over.",
  gone: "That email has gone.",
  includeHeld: "Only an email the check held for a reason is included.",
  givenUp: "This email waited two weeks for your answer and was given up.",
  decision: "Include, rewrite, skip or not a fit.",
  /** A row's CHECK refused what the words' rules let through: never expected, said plainly. */
  unsaved: "That reach-out could not be saved as it is. Check its steps and try again.",
  /** DELETE playbooks/[id] on a reach-out (R16): its history is never deleted there. */
  notHere: "A reach-out is removed from its own row, and only before its first email goes. After that, pause it.",
  /** The preview on a deployment that runs nothing. */
  preview: "Previews only work on the production dashboard.",
  previewDown: "The preview could not be written just now. Try again in a moment.",
  budget: "Today's assistant budget is spent, so the preview waits until tomorrow.",
} as const;

const REFUSAL_SET = new Set<string>(Object.values(REACH_OUT_REFUSALS));
/** Whether a door's message is one of the refusals above, and so may be shown as it is. */
export function isReachOutRefusal(message: string | null | undefined): boolean {
  return REFUSAL_SET.has(message ?? "");
}

const pct = (n: number, of: number): number => (of > 0 ? Math.round((n / of) * 100) : 0);

/** Who gets it (the reach block): the count, the bar, and the reasons, each with its door. */
export function reachLineOf(r: ReachOutReachDto, includeUnconfirmed: boolean) {
  const unconfirmed = Math.max(0, r.with_unconfirmed - r.ready);
  const count = includeUnconfirmed ? r.with_unconfirmed : r.ready;
  const held = includeUnconfirmed ? 0 : unconfirmed;
  const will = pct(count, r.of);
  const heldPct = pct(held, r.of);
  const why: Array<{ tone: "warn" | "plain"; text: string; door: string | null }> = [];
  if (unconfirmed > 0)
    why.push(
      includeUnconfirmed
        ? { tone: "plain", text: `${unconfirmed} unconfirmed addresses, included`, door: "Leave them out" }
        : { tone: "warn", text: `${unconfirmed} unconfirmed addresses, held`, door: "Include them" },
    );
  if (r.phone_only > 0) why.push({ tone: "plain", text: `${r.phone_only} by phone only, kept for calls`, door: null });
  return {
    count,
    of: `of ${r.of} on the search`,
    bar: { will, held: heldPct, rest: Math.max(0, 100 - will - heldPct) },
    why,
  };
}

/** The pace sentence as tokens (the odd places are the sheet's editable tokens), and why its day is what it is. */
export function paceWords(p: { share: number; sentDays: number; gapMinutes: number }) {
  const next = DOMAIN_RAMP.find((s) => s.days > p.sentDays);
  const why = next
    ? `${p.sentDays < 1 ? "Recommended for a new domain. " : ""}Rises to ${next.perDay} a day after ${next.days} clean days.`
    : "The most a domain sends in a day.";
  return {
    parts: [
      "",
      String(p.share),
      " a day per domain, one every ",
      `${p.gapMinutes} min`,
      " or so, in each business's open hours. Never on their closed days.",
    ],
    why,
  };
}

export function sheetFootWords(p: { share: number; gapMinutes: number; ready: number; editing: boolean }): string {
  if (p.editing) return "Your changes go with the next emails. What has gone stays as it went.";
  if (p.ready === 0) return "Nobody on this search can be written to yet.";
  return `Goes to ${Math.min(p.share, p.ready)} a day, one every ${p.gapMinutes} minutes or so as each business opens. The first run waits on you.`;
}

export function stepLabel(n: number): string {
  return n === 0 ? "Your email" : n === 1 ? "A short nudge" : `Email ${n + 1}`;
}

export function stepWhenWords(n: number, afterDays: number | null): string {
  return n === 0 ? "Day one, in their hours" : `After ${afterDays ?? "?"} days with nothing back · in the same thread`;
}

/**
 * What Start did, said as it happened (R14): each reason in its own words. "Planned within the hour" only when the edge
 * could not be asked, since the hourly sweep then plans it.
 */
export function startWords(s: ReachOutStartDto): { tone: "good" | "warn" | "plain"; text: string } {
  const n = plural(s.planned, "email", "emails");
  switch (s.outcome) {
    case "sent":
      return {
        tone: "good",
        text: `Planned ${n}. They go in each business's hours; you have thirty minutes to stop them.`,
      };
    case "held":
      switch (s.reason) {
        case "waiting_for_you":
          return s.planned > 0
            ? { tone: "good", text: `Planned ${n}. The first run waits on you: open it to approve.` }
            : { tone: "plain", text: "A run of this reach-out already waits on you. Answer it first." };
        case "billing":
          return { tone: "warn", text: "Saved. Nothing is planned until billing is sorted: open Billing." };
        case "no_domain":
          return { tone: "warn", text: `Saved. Nothing is planned yet. ${REACH_OUT_SHEET_WORDS.noDomain}` };
        case "no_room":
          return {
            tone: "plain",
            text: "Saved. Your domains have sent all they may today, so the first run is tomorrow.",
          };
        default:
          return { tone: "plain", text: "Saved. The first run is held." };
      }
    case "off":
      return s.reason === "never"
        ? { tone: "warn", text: "Saved. Outreach is set to Never in Settings › Autonomy, so nothing runs." }
        : s.reason === "workspace_paused"
          ? { tone: "warn", text: "Saved. This workspace is paused, so nothing runs until it is resumed." }
          : { tone: "plain", text: "Saved. It is paused, so nothing was planned." };
    case "empty":
      return s.reason === "already_ran"
        ? { tone: "plain", text: "Saved. It already ran today; it runs again tomorrow." }
        : { tone: "plain", text: "Saved. Nobody on this search can be written to yet; it looks again each day." };
    case "failed":
      return { tone: "warn", text: "Saved. The first run could not be planned just now; it is tried again each hour." };
    case "unreached":
      return { tone: "plain", text: "Saved. The first run is planned within the hour." };
    case "preview":
      return { tone: "plain", text: "Saved. Running only works on the production dashboard." };
  }
}

/**
 * The chain's next run (R23), as the database holds it: paused, set to never, held for billing, a run waiting for its
 * owner, or when the sweep runs it (playbook-schedule's nextRunLabel, the moments' own).
 */
export function nextRunWords(
  c: Pick<ReachOutChainDto, "state" | "next">,
  tz: string,
  now: Date,
): { tone: "warn" | "plain"; text: string; run_id: string | null } {
  if (c.state !== "running")
    return { tone: "plain", text: "Paused. Nothing is planned until you resume it.", run_id: null };
  if (c.next.mode === "never")
    return { tone: "warn", text: "Outreach is set to Never in Settings › Autonomy, so nothing runs.", run_id: null };
  if (!c.next.may_spend)
    return { tone: "warn", text: "Held for billing: nothing is planned until billing is sorted.", run_id: null };
  if (c.next.waiting_run_id)
    return {
      tone: "warn",
      text: "A run waits on you. Nothing more is planned until you answer it.",
      run_id: c.next.waiting_run_id,
    };
  const at = nextRunLabel({ state: "running", run_hour: c.next.run_hour, last_run_for: c.next.last_run_for }, tz, now);
  return { tone: "plain", text: `Next run ${at}.`, run_id: null };
}

/** The first send's time by the business's clock: contracts' one formatter (clock.ts clockTime). */
const clock = (iso: string, tz: string): string => clockTime(Date.parse(iso), tz);

/**
 * The approval sheet for a reach-out run (F13; canvas board 05; R21, R22). `today` is the workspace's date and `now`
 * the moment it is said: a run from an earlier day goes from now, re-timed in their hours, and one whose first time has
 * passed today goes from now; never a time already past.
 */
export function approvalWordsOf(r: ReachOutRunDto, p: { timezone: string; share: number; today: string; now: number }) {
  const earlier = !!r.run_for && r.run_for < p.today;
  const passed = !earlier && !!r.first_at && Date.parse(r.first_at) <= p.now;
  const at = earlier || passed ? null : r.first_at ? clock(r.first_at, p.timezone) : null;
  const total = r.today + r.later;
  const why: Array<{ tone: "warn" | "plain" | "info"; text: string; door: string | null }> = [];
  if (r.later > 0)
    why.push({
      tone: "plain",
      text: `${r.later} wait for the coming days — ${p.share} a day on this domain`,
      door: null,
    });
  if (r.held.length > 0) why.push({ tone: "warn", text: `${r.held.length} held by the check`, door: "See them" });
  if (r.checking > 0) why.push({ tone: "info", text: `The receptionist is checking ${r.checking} more`, door: null });
  const words: Array<{ text: string; opening: boolean }> = [];
  if (r.first) {
    const open = r.first.opening;
    const leads = !!open && r.first.body.startsWith(open);
    const rest = leads ? r.first.body.slice(open!.length) : r.first.body;
    if (leads) words.push({ text: open!, opening: true });
    if (rest.trim()) words.push({ text: rest.replace(/^\s+/, ""), opening: false });
  }
  const hosts = r.domains.map((d) => d.host);
  const from =
    r.domains.length === 1
      ? `all from ${r.domains[0]!.host}, ${plural(r.domains[0]!.sent_days, "clean day", "clean days")}`
      : r.domains.length > 1
        ? `from ${hosts.slice(0, -1).join(", ")} and ${hosts[hosts.length - 1]}`
        : null;
  const goes = earlier
    ? " · goes from now, re-timed in their hours, once you approve it"
    : passed
      ? " · goes from now, in their hours, once you approve it"
      : at
        ? ` · goes from ${at} once you approve it`
        : "";
  // A run whose step was dropped from its chain since (R17) says so, never another step's name.
  const step =
    r.step_n === null ? "a step since removed" : `step ${r.step_n + 1}, ${stepLabel(r.step_n).toLowerCase()}`;
  return {
    title: r.chain_name,
    sub: `Reach-out · ${step}${goes}, one every ${r.gap_minutes} minutes as each business opens`,
    will: `${r.today} will get it today`,
    of: `of ${total + r.held.length + r.checking}`,
    why,
    rules: [
      ...(r.include_unconfirmed ? [] : ["each has a checked address"]),
      "none is on a person in People",
      "none heard from you before",
      ...(from ? [from] : []),
    ],
    words,
    reader: r.first
      ? `as ${r.first.business_name} reads it · every opening is its own; your offer and ask are the same for all ${total}`
      : null,
    approve: `Approve — ${r.today}${earlier || passed ? " from now" : at ? ` from ${at}` : ""}`,
    approveNote: r.checking > 0 ? `${r.checking} more are being checked; they go once they pass.` : null,
    note: "Skipping loses this run only — the reach-out keeps its place and asks again tomorrow.",
    recheck: r.held.some((h) => h.reason === "check_unavailable" && h.detail === null)
      ? REACH_OUT_SHEET_WORDS.recheck
      : null,
    held: r.held.map((h) => ({
      id: h.send_id,
      name: h.business_name,
      why: holdWords(h.reason, h.detail),
      doors: holdDoors(h.reason).map((d): [HoldDoor, string] => [d, HOLD_DOOR_WORDS[d]]),
    })),
  };
}

/** A run's day as its history line says it: "Sep 24". */
const runDayWords = (runFor: string): string =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${runFor}T12:00:00Z`),
  );

/**
 * A chain's pace as its domains allow it: how many a day across them (each domain's ramp, D15), and the one domain's
 * name when it sends from one. Nothing to send from is a share of 0 and no host.
 */
export function chainPaceOf(c: Pick<ReachOutChainDto, "domains">): { host: string | null; share: number } {
  return {
    host: c.domains.length === 1 ? c.domains[0]!.host : null,
    share: c.domains.reduce((t, d) => t + domainDailyCap(d.sent_days), 0),
  };
}

/** The chain drawn as its steps, each after the one before by its days, and what stops it (the open row's first line). */
export function chainPathWords(c: Pick<ReachOutChainDto, "steps">) {
  return {
    steps: c.steps.map((s) => ({
      id: s.id,
      label: stepLabel(s.n),
      after: s.n === 0 ? null : `after ${s.after_days ?? "?"} days, nothing back`,
    })),
    stops: "Stops for anyone who writes back, books or says no.",
  };
}

/** What Playbooks' chain row says around its acts (PR 8). */
export const REACH_OUT_ROW_WORDS = {
  reading: "Reading how it is doing…",
  failed: "how this reach-out is doing",
  pause: "Pause",
  resume: "Resume",
  remove: "Remove",
  removeAsk: (name: string) => `Remove “${name}”?`,
  removeYes: "Yes, remove",
  paused: (name: string) => `${name} is paused — nothing more is planned until you resume it`,
  resumed: (name: string) => `${name} is running — its next run is on its row`,
  removed: (name: string) => `${name} is removed, and its words with it`,
  runs: (n: number) => (n === 1 ? "1 run" : `${n} runs`),
  noRun: "No run yet",
  edit: "Edit",
} as const;

/** Playbooks' row for a chain (F14; canvas board 07): what the list says before the row is opened. */
export function chainHintOf(c: ReachOutChainDto, host: string | null): string {
  const labels = c.steps.map((s) => stepLabel(s.n).toLowerCase());
  return `${labels.join(", ").replace(/^your email/, "Your email")}${host ? ` · from ${host}` : ""}`;
}

/** The open row: the chain's report said (R23), and whether it may be removed (R16). */
export function chainReportWordsOf(
  c: ReachOutChainDto,
  report: ReachOutChainReportDto,
  reach: ReachOutReachDto,
  p: { host: string | null; share: number },
) {
  const sum = (k: "written" | "wrote_back" | "said_no" | "bounced" | "held") =>
    report.steps.reduce((t, s) => t + s[k], 0);
  const written = sum("written");
  const wroteBack = sum("wrote_back");
  const saidNo = sum("said_no");
  const bounced = sum("bounced");
  const held = sum("held");
  const clauses = [`${written} written`];
  if (wroteBack > 0) clauses.push(`${wroteBack} wrote back`);
  if (saidNo > 0) clauses.push(`${saidNo} said no`);
  if (bounced > 0) clauses.push(`${bounced} bounced and their addresses were dropped`);
  const first = report.steps.find((s) => s.n === 0);
  const afterOf = new Map(c.steps.map((s) => [s.id, s.after_days]));
  return {
    // Who the chain has reached or will: its first step's written, waiting and held, and the search's still ready.
    reaches: {
      n: reach.ready + (first?.written ?? 0) + (first?.waiting ?? 0) + (first?.held ?? 0),
      of: `of ${reach.of} on the search`,
    },
    head: ["Step", "When", "Written", "Delivered", "Wrote back", "Said no", "Bounced"],
    table: report.steps.map((s) => [
      stepLabel(s.n),
      s.n === 0 ? "Day one, in their hours" : `After ${afterOf.get(s.id) ?? "?"} days with nothing back`,
      String(s.written),
      `${s.delivered} (${pct(s.delivered, s.written)}%)`,
      `${s.wrote_back} (${pct(s.wrote_back, s.written)}%)`,
      String(s.said_no),
      String(s.bounced),
    ]),
    sentence:
      p.share > 0
        ? `${p.share} a day${p.host ? ` from ${p.host}` : ""}, one every ${c.gap_minutes} minutes in each business's hours. ${clauses.join("; ")}.`
        : `${REACH_OUT_SHEET_WORDS.noDomain} ${clauses.join("; ")}.`,
    // The held wait for their owner in their run (R20): the newest run that holds some opens them.
    waiting:
      held > 0 ? { text: `${held} wait for your say`, run_id: report.runs.find((r) => r.held > 0)?.id ?? null } : null,
    history: report.runs.map((r) => ({
      id: r.id,
      text: `${r.run_for ? runDayWords(r.run_for) : "A run"} · ${r.written} written${r.held > 0 ? ` · ${r.held} held` : ""}`,
    })),
    stopOne: REACH_OUT_SHEET_WORDS.stopOne,
    canRemove: report.can_remove,
    remove: report.can_remove ? REACH_OUT_SHEET_WORDS.removeNote : null,
  };
}

/** Templates' row for a reach-out step's words (F15; canvas board 14; R19: a reach-out sends email only). */
export function emailTemplateWords(p: { chainName: string; stepN: number; afterDays: number | null }) {
  return {
    chip: "Email",
    sends: p.chainName,
    sendsNote:
      p.stepN === 0
        ? "step 1 · writes daily, in their hours"
        : `step ${p.stepN + 1} · after ${p.afterDays} days with nothing back`,
    versionsNote: "a reach-out sends email only",
    checkNote:
      "Checked before each send: every slot filled or the email held; the opening's facts in the finder's record; under 120 words; the footer present; the language theirs.",
    foot: "Email · made here · your own words, no review",
    edit: "Edit in its reach-out",
  };
}

/** One email of a reach-out as Templates lists it (R19): its words, and the chain and step that send it. */
interface EmailTemplateRowVM {
  template_id: string;
  step_id: string;
  subject: string | null;
  body: string;
  root_id: string;
  chain_name: string;
  step_n: number;
  after_days: number | null;
}

/**
 * Templates' email rows (R19), from the chains as `GET reach-outs` lists them: each step with words is one row, in its
 * chain's order. How many each has written is its chain's report, read when the row opens (R23), never here: the list
 * costs no count.
 */
export function emailTemplateRowsOf(chains: readonly ReachOutChainDto[]): EmailTemplateRowVM[] {
  return chains.flatMap((c) =>
    c.steps.flatMap((s) =>
      s.template_id
        ? [
            {
              template_id: s.template_id,
              step_id: s.id,
              subject: s.subject,
              body: s.body,
              root_id: c.root_id,
              chain_name: c.name,
              step_n: s.n,
              after_days: s.after_days,
            },
          ]
        : [],
    ),
  );
}

/** What an email row has written, from its chain's report as read (R23); null when that report says nothing of it. */
export function emailRowWrittenOf(report: ReachOutChainReportDto | null, stepId: string): number | null {
  return report?.steps.find((x) => x.id === stepId)?.written ?? null;
}

/** What Templates says of its email rows as a list (R19): the head's hover beside WhatsApp's, and a read that failed. */
export const EMAIL_TEMPLATE_LIST_WORDS = {
  /** Said after WhatsApp's hover when the head's count takes email rows too. */
  headTip: (emails: number): string =>
    emails > 0
      ? `The count takes ${plural(emails, "email")} of your reach-outs too: their own words, sent by email, with no review.`
      : "",
  failed: "your reach-outs' emails",
} as const;
