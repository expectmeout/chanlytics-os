import { clockTime, clockWhen, zoneDayKey } from "../shared/clock.js";
import { mailboxDailyCap } from "../email/mailbox-connections.js";
import { nextRunLabel } from "../playbooks/playbook-schedule.js";
import { PLAYBOOK_VETO_DELAY_WORDS } from "../playbooks/playbook-triggers.js";
import { plural } from "../shared/words.js";
import { HOLD_DOOR_WORDS, holdDoors, holdWords } from "./reach-out-words.js";
import { REACH_OUT_DRAFTS_PER_DAY } from "./reach-out-rules.js";
import { SEND_DAY_FRAME } from "./reach-out-timetable.js";
import { pct } from "../shared/numbers.js";
import { dateFormat } from "../shared/time.js";
export const REACH_OUT_SHEET_WORDS = {
  sub: "Your email, opened for each business, from your own mailbox. Replies come back to it, and to your Inbox.",
  who: "Ready, with a checked address, never written to. Keeps itself current.",
  opening: "The receptionist opens each email from the finder's record. It never invents a fact: anything it can't back is held.",
  stops: "Stops when they reply, book, unsubscribe, bounce or say no.",
  stopOne: "To stop one business, press Stop writing to them on its lead.",
  first: `Starts today. You approve the first run; after that you have ${PLAYBOOK_VETO_DELAY_WORDS} to stop each one.`,
  slotsHint: "each is filled for each business, or the email is held",
  foot: "Why they're hearing from you, your address, Unsubscribe",
  footHint: "as the law asks",
  repliesHint: "into your Inbox",
  checkLater: "Each email is checked before it goes. The first run waits for you.",
  noMailbox: "Connect the mailbox you'll write from first: Google or Microsoft, here or in Settings \u203A Connections \u203A Email.",
  /** From, when its owner sends it (00429): what they are handed, and how. */
  ownerSends: `Each email is handed to you written and checked, to send from your own inbox: Gmail, Outlook or your mail app. Up to ${REACH_OUT_DRAFTS_PER_DAY} a day.`,
  /** From, with no mailbox connected: the owner sends, and a mailbox would send for them. */
  ownerNoMailbox: "Or connect Google or Microsoft, and your mailbox sends them for you.",
  anotherStep: "Another step",
  anotherStepHint: "\xB7 another email",
  /** The last step may hand each business it reaches to you instead (Part 5, G20). */
  anotherCall: "A call for you",
  anotherNote: "A note for you",
  handHint: "\xB7 ends the chain: each business it reaches is a step on your Today",
  handWords: "What to do",
  handPlaceholder: "Ask whether our quote suited them",
  remove: "Remove",
  removeNote: "Only before its first email goes; after that, pause it.",
  recheck: "Check the held again",
  /** A business on a run's sheet, held, ready or to send, opens its lead over the page (the name's tip). */
  openLead: "Open this business's lead"
};
export const REACH_OUT_REFUSALS = {
  exists: "This search has a reach-out already.",
  wrote: "This reach-out has written already. Pause it instead.",
  stepWrote: "That step has written already. Pause the reach-out instead.",
  /** 00228's: a call or a note anywhere but last, and a step changed from one to the other once it has run. */
  handLast: "A call or a note ends the chain.",
  stepRan: "That step has run already. Add a new step instead.",
  outOfPlace: "A step is out of its place. Open the reach-out again.",
  notFound: "Reach-out not found.",
  workspaceNotFound: "Workspace not found.",
  oneEmail: "A reach-out has at least one email.",
  /** lead_set_stage's own, when Not a fit finds its lead missing or erased. */
  leadNotFound: "Lead not found.",
  leadGone: "This lead is gone.",
  /** 00241 reach_out_lead_stop: a lead no chain ever planned (Part 6, H10). */
  nothingWritten: "Nothing has been written to them yet.",
  /** reach_out_report (00241, 00360): any count of days Reports reads, as its other functions take them. */
  period: "A period is 1 to 90 days.",
  searchNotFound: "Search not found.",
  mailboxNotFound: "Mailbox not found.",
  sendNotFound: "Email not found.",
  runNotFound: "Run not found.",
  runOver: "That run is over.",
  gone: "That email has gone.",
  includeHeld: "Only an email the check held for a reason is included.",
  givenUp: "This email waited two weeks for your answer and was given up.",
  decision: "Include, rewrite, skip or not a fit.",
  /** A row's CHECK refused what the words' rules let through: never expected, said plainly. */
  unsaved: "That sequence could not be saved as it is. Check its steps and try again.",
  /** DELETE playbooks/[id] on a reach-out (R16): its history is never deleted there. */
  notHere: "A sequence to leads is removed from its own row, and only before its first email goes. After that, pause it.",
  /** The preview on a deployment that runs nothing. */
  preview: "Previews only work on the production dashboard.",
  previewDown: "The preview could not be written just now. Try again in a moment.",
  budget: "Today's assistant budget is spent, so the preview waits until tomorrow."
};
const REFUSAL_SET = new Set(Object.values(REACH_OUT_REFUSALS));
export function isReachOutRefusal(message) {
  return REFUSAL_SET.has(message ?? "");
}
export function reachLineOf(r, includeUnconfirmed) {
  const unconfirmed = Math.max(0, r.with_unconfirmed - r.ready);
  const count = includeUnconfirmed ? r.with_unconfirmed : r.ready;
  const held = includeUnconfirmed ? 0 : unconfirmed;
  const will = pct(count, r.of) ?? 0;
  const heldPct = pct(held, r.of) ?? 0;
  const why = [];
  if (unconfirmed > 0)
    why.push(
      includeUnconfirmed ? {
        tone: "plain",
        text: `${plural(unconfirmed, "unconfirmed address", "unconfirmed addresses")}, included`,
        door: "Leave them out"
      } : {
        tone: "warn",
        text: `${plural(unconfirmed, "unconfirmed address", "unconfirmed addresses")}, held`,
        door: "Include them"
      }
    );
  if (r.phone_only > 0) why.push({ tone: "plain", text: `${r.phone_only} by phone only, kept for calls`, door: null });
  return {
    count,
    of: `of ${r.of} on the search`,
    bar: { will, held: heldPct, rest: Math.max(0, 100 - will - heldPct) },
    why
  };
}
export function paceWords(p) {
  const why = p.rises !== null ? `A new mailbox starts slow and grows with the days it sends: the pace rises in ${plural(p.rises, "more day", "more days")} of sending.` : "As much as your mailboxes write in a day.";
  return {
    parts: [
      "",
      String(p.share),
      ` a day${p.mailboxes > 1 ? ` across ${p.mailboxes} mailboxes` : ""}, one every `,
      `${p.gapMinutes} min`,
      " or so, in each business's open hours. Never on their closed days."
    ],
    why
  };
}
export function ownerPaceWords() {
  return {
    line: `Up to ${REACH_OUT_DRAFTS_PER_DAY} a day, handed to you as each run goes ahead. You send each when you like.`,
    why: "You are the pace: a nudge is handed to you before new businesses, so none waits behind them."
  };
}
export function sheetFootWords(p) {
  if (p.editing) return "Your changes go with the next emails. What has gone stays as it went.";
  if (p.ready === 0) return "Nobody on this search can be written to yet.";
  if (p.ownerSends)
    return `Hands you up to ${Math.min(REACH_OUT_DRAFTS_PER_DAY, p.ready)} a day to send from your inbox. The first run waits on you.`;
  return `Goes to ${Math.min(p.share, p.ready)} a day, one every ${p.gapMinutes} minutes or so as each business opens. The first run waits on you.`;
}
export function stepLabel(n) {
  return n === 0 ? "Your email" : n === 1 ? "A short nudge" : `Email ${n + 1}`;
}
export function stepLabelOf(s) {
  if (!s.hand) return stepLabel(s.n);
  return s.hand.kind === "call" ? REACH_OUT_SHEET_WORDS.anotherCall : REACH_OUT_SHEET_WORDS.anotherNote;
}
export function stepWhenWords(n, afterDays) {
  return n === 0 ? "Day one, in their hours" : `After ${afterDays ?? "?"} days with nothing back \xB7 in the same thread`;
}
export function startWords(s, ownerSends = false) {
  const n = plural(s.planned, "email", "emails");
  switch (s.outcome) {
    case "sent":
      return {
        tone: "good",
        text: ownerSends ? `Planned ${n}. Each is handed to you to send once it is checked; you have ${PLAYBOOK_VETO_DELAY_WORDS} to stop them.` : `Planned ${n}. They go in each business's hours; you have ${PLAYBOOK_VETO_DELAY_WORDS} to stop them.`
      };
    case "held":
      switch (s.reason) {
        case "waiting_for_you":
          return s.planned > 0 ? { tone: "good", text: `Planned ${n}. The first run waits on you: open it to approve.` } : { tone: "plain", text: "A run of this sequence already waits on you. Answer it first." };
        case "billing":
          return { tone: "warn", text: "Saved. Nothing is planned until billing is sorted: open Billing." };
        case "no_mailbox":
          return { tone: "warn", text: `Saved. Nothing is planned yet. ${REACH_OUT_SHEET_WORDS.noMailbox}` };
        case "no_room":
          return {
            tone: "plain",
            text: "Saved. Your mailboxes have written all they may today, so the first run is tomorrow."
          };
        default:
          return { tone: "plain", text: "Saved. The first run is held." };
      }
    case "off":
      return s.reason === "workspace_paused" ? { tone: "warn", text: "Saved. This workspace is paused, so nothing runs until it is resumed." } : { tone: "plain", text: "Saved. It is paused, so nothing was planned." };
    case "empty":
      return s.reason === "already_ran" ? { tone: "plain", text: "Saved. It already ran today; it runs again tomorrow." } : { tone: "plain", text: "Saved. Nobody on this search can be written to yet; it looks again each day." };
    case "failed":
      return { tone: "warn", text: "Saved. The first run could not be planned just now; it is tried again each hour." };
    case "unreached":
      return { tone: "plain", text: "Saved. The first run is planned within the hour." };
    case "preview":
      return { tone: "plain", text: "Saved. Running only works on the production dashboard." };
  }
}
export function nextRunWords(c, tz, now) {
  if (c.state !== "running")
    return { tone: "plain", text: "Paused. Nothing is planned until you resume it.", run_id: null };
  if (!c.next.may_spend)
    return { tone: "warn", text: "Held for billing: nothing is planned until billing is sorted.", run_id: null };
  if (c.next.waiting_run_id)
    return {
      tone: "warn",
      text: "A run waits on you. Nothing more is planned until you answer it.",
      run_id: c.next.waiting_run_id
    };
  const at = nextRunLabel(
    { state: "running", run_hour: c.next.run_hour, last_run_for: c.next.last_run_for },
    tz,
    now,
    false
  );
  return { tone: "plain", text: `Next run ${at}.`, run_id: null };
}
const clock = (iso, tz) => clockTime(Date.parse(iso), tz);
function firstSendWhen(firstAt, tz, now) {
  if (!firstAt) return null;
  const ms = Date.parse(firstAt);
  return zoneDayKey(ms, tz) === zoneDayKey(now, tz) ? clock(firstAt, tz) : clockWhen(ms, tz, now);
}
function approveWords(today, from) {
  if (!from) return `Approve \u2014 ${today}`;
  return today > 0 ? `Approve \u2014 ${today} from ${from}` : `Approve \u2014 from ${from}`;
}
function runSenderWords(r, share) {
  if (r.owner_sends === true) {
    const drafted = r.drafted?.length ?? 0;
    return {
      drafted,
      later: `${r.later} wait for the coming days \u2014 ${share} a day handed to you`,
      from: "you send each from your own inbox",
      pace: "each handed to you to send from your inbox",
      will: `${r.today + drafted} for you to send`
    };
  }
  const addresses = r.mailboxes.map((m) => m.address);
  const [only, ...others] = r.mailboxes;
  return {
    drafted: 0,
    later: `${r.later} wait for the coming days \u2014 ${share} a day from ${r.mailboxes.length === 1 ? "this mailbox" : "these mailboxes"}`,
    from: only && others.length === 0 ? `all from ${only.address}, ${plural(only.sent_days, "day of sending", "days of sending")}` : r.mailboxes.length > 1 ? `from ${addresses.slice(0, -1).join(", ")} and ${addresses[addresses.length - 1]}` : null,
    pace: `one every ${r.gap_minutes} minutes as each business opens`,
    will: `${r.today} will get it today`
  };
}
export function approvalWordsOf(r, p) {
  const earlier = !!r.run_for && r.run_for < p.today;
  const passed = !earlier && !!r.first_at && Date.parse(r.first_at) <= p.now;
  const at = earlier || passed ? null : firstSendWhen(r.first_at, p.timezone, p.now);
  const total = r.today + r.later;
  const sender = runSenderWords(r, p.share);
  const why = [];
  if (r.later > 0) why.push({ tone: "plain", text: sender.later, door: null });
  if (r.held.length > 0) why.push({ tone: "warn", text: `${r.held.length} held by the check`, door: "See them" });
  if (r.checking > 0) why.push({ tone: "info", text: `The receptionist is checking ${r.checking} more`, door: null });
  const words = [];
  if (r.first) {
    const open = r.first.opening;
    const leads = !!open && r.first.body.startsWith(open);
    const rest = leads ? r.first.body.slice(open.length) : r.first.body;
    if (leads) words.push({ text: open, opening: true });
    if (rest.trim()) words.push({ text: rest.replace(/^\s+/, ""), opening: false });
  }
  const goes = r.owner_sends ? " \xB7 handed to you as each is checked, once you approve it" : earlier ? " \xB7 goes from now, re-timed in their hours, once you approve it" : passed ? " \xB7 goes from now, in their hours, once you approve it" : at ? ` \xB7 goes from ${at} once you approve it` : "";
  const step = r.step_n === null ? "a step since removed" : `step ${r.step_n + 1}, ${stepLabel(r.step_n).toLowerCase()}`;
  return {
    title: r.chain_name,
    sub: `To leads \xB7 ${step}${goes}, ${sender.pace}`,
    will: sender.will,
    of: `of ${total + sender.drafted + r.held.length + r.checking}`,
    why,
    rules: [
      ...r.include_unconfirmed ? [] : ["each has a checked address"],
      "none is on a person in People",
      "none heard from you before",
      ...sender.from ? [sender.from] : []
    ],
    words,
    reader: r.first ? `as ${r.first.business_name} reads it \xB7 every opening is its own; your offer and ask are the same for all ${total}` : null,
    approve: approveWords(r.today, earlier || passed ? "now" : at),
    approveNote: r.checking > 0 ? `${r.checking} more are being checked; they go once they pass.` : null,
    note: "Skipping loses this run only \u2014 the sequence keeps its place and asks again tomorrow.",
    recheck: r.held.some((h) => h.reason === "check_unavailable" && h.detail === null) ? REACH_OUT_SHEET_WORDS.recheck : null,
    held: r.held.map((h) => ({
      id: h.send_id,
      name: h.business_name,
      // Its lead's id, which the sheet's name opens over the page; none from a read before the lead was carried.
      leadId: h.lead_id || null,
      why: holdWords(h.reason, h.detail),
      doors: holdDoors(h.reason).map((d) => [d, HOLD_DOOR_WORDS[d]])
    }))
  };
}
const runDayWords = (runFor) => dateFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(/* @__PURE__ */ new Date(`${runFor}T12:00:00Z`));
export function chainPaceOf(c) {
  if (c.owner_sends) return { from: null, share: REACH_OUT_DRAFTS_PER_DAY };
  const [only, ...others] = c.mailboxes;
  const fits = Math.floor((SEND_DAY_FRAME.to - SEND_DAY_FRAME.from) / Math.max(1, c.gap_minutes || 1)) + 1;
  return {
    from: only && others.length === 0 ? only.address : null,
    share: c.mailboxes.reduce((t, m) => t + Math.min(mailboxDailyCap(m), fits), 0)
  };
}
export function chainPathWords(c) {
  return {
    steps: c.steps.map((s) => ({
      id: s.id,
      label: stepLabelOf(s),
      after: s.n === 0 ? null : `after ${s.after_days ?? "?"} days, nothing back`
    })),
    stops: "Stops for anyone who writes back, books or says no."
  };
}
export const REACH_OUT_ROW_WORDS = {
  reading: "Reading how it is doing\u2026",
  failed: "how this sequence is doing",
  pause: "Pause",
  resume: "Resume",
  remove: "Remove",
  removeAsk: (name) => `Remove \u201C${name}\u201D?`,
  removeYes: "Yes, remove",
  paused: (name) => `${name} is paused \u2014 nothing more is planned until you resume it`,
  resumed: (name) => `${name} is running \u2014 its next run is on its row`,
  removed: (name) => `${name} is removed, and its words with it`,
  runs: (n) => n === 1 ? "1 run" : `${n} runs`,
  noRun: "No run yet",
  edit: "Edit"
};
export function chainHintOf(c, from) {
  const labels = c.steps.map((s) => stepLabelOf(s).toLowerCase());
  const by = c.owner_sends ? " \xB7 you send them" : from ? ` \xB7 from ${from}` : "";
  return `${labels.join(", ").replace(/^your email/, "Your email")}${by}`;
}
function reportRowOf(s, step) {
  const label = stepLabelOf({ n: s.n, hand: step?.hand ?? null });
  const when = s.n === 0 ? "Day one, in their hours" : `After ${step?.after_days ?? "?"} days with nothing back`;
  if (step?.hand) return [label, when, `${s.handed ?? 0} handed to you`, "\u2014", "\u2014", "\u2014", "\u2014", "\u2014", "\u2014"];
  return [
    label,
    when,
    String(s.written),
    `${s.delivered} (${pct(s.delivered, s.written) ?? 0}%)`,
    `${s.wrote_back} (${pct(s.wrote_back, s.written) ?? 0}%)`,
    // Interested and booked (Part 6, H7): absent from a report read before 00241, and then unknown, never a zero.
    s.interested === void 0 ? "\u2014" : String(s.interested),
    s.booked === void 0 ? "\u2014" : String(s.booked),
    String(s.said_no),
    String(s.bounced)
  ];
}
export function chainReportWordsOf(c, report, reach, p) {
  const sum = (k) => report.steps.reduce((t, s) => t + (s[k] ?? 0), 0);
  const written = sum("written");
  const wroteBack = sum("wrote_back");
  const saidNo = sum("said_no");
  const bounced = sum("bounced");
  const held = sum("held");
  const handed = sum("handed");
  const clauses = [`${written} written`];
  if (handed > 0) clauses.push(`${handed} handed to you`);
  if (wroteBack > 0) clauses.push(`${wroteBack} wrote back`);
  if (saidNo > 0) clauses.push(`${saidNo} said no`);
  if (bounced > 0) clauses.push(`${bounced} bounced and their addresses were dropped`);
  const first = report.steps.find((s) => s.n === 0);
  const stepOf = new Map(c.steps.map((s) => [s.id, s]));
  return {
    // Who the chain has reached or will: its first step's written, waiting and held, and the search's still ready.
    reaches: {
      n: reach.ready + (first?.written ?? 0) + (first?.waiting ?? 0) + (first?.held ?? 0),
      of: `of ${reach.of} on the search`
    },
    head: ["Step", "When", "Written", "Delivered", "Wrote back", "Interested", "Booked", "Said no", "Bounced"],
    table: report.steps.map((s) => reportRowOf(s, stepOf.get(s.id))),
    sentence: c.owner_sends ? `You send these from your own inbox, up to ${p.share} a day handed to you. ${clauses.join("; ")}.` : p.share > 0 ? `${p.share} a day${p.from ? ` from ${p.from}` : ""}, one every ${c.gap_minutes} minutes in each business's hours. ${clauses.join("; ")}.` : `${REACH_OUT_SHEET_WORDS.noMailbox} ${clauses.join("; ")}.`,
    // The held wait for their owner in their run (R20): the newest run that holds some opens them.
    waiting: held > 0 ? { text: `${held} wait for your say`, run_id: report.runs.find((r) => r.held > 0)?.id ?? null } : null,
    history: report.runs.map((r) => ({
      id: r.id,
      text: `${r.run_for ? runDayWords(r.run_for) : "A run"} \xB7 ${(r.handed ?? 0) > 0 ? `${r.handed} handed to you` : `${r.written} written`}${r.held > 0 ? ` \xB7 ${r.held} held` : ""}`
    })),
    stopOne: REACH_OUT_SHEET_WORDS.stopOne,
    canRemove: report.can_remove,
    remove: report.can_remove ? REACH_OUT_SHEET_WORDS.removeNote : null
  };
}
export function emailTemplateWords(p) {
  return {
    chip: "Email",
    sends: p.chainName,
    sendsNote: p.stepN === 0 ? "step 1 \xB7 writes daily, in their hours" : `step ${p.stepN + 1} \xB7 after ${p.afterDays} days with nothing back`,
    /** The fold the check is read under, where its sentence stood open under every email (the fitted sheets). */
    checkLabel: "What is checked before each send",
    checkNote: "Checked before each send: every slot filled or the email held; the opening's facts in the finder's record; under 120 words; the footer present; the language theirs.",
    /** The act that opens the whole reach-out, whose days, pace and mailboxes are its own. */
    edit: "Edit the sequence"
  };
}
export function emailTemplateRowsOf(chains) {
  return chains.flatMap(
    (c) => c.steps.flatMap(
      (s) => s.template_id ? [
        {
          template_id: s.template_id,
          step_id: s.id,
          subject: s.subject,
          body: s.body,
          root_id: c.root_id,
          chain_name: c.name,
          step_n: s.n,
          after_days: s.after_days,
          signed_by: c.signed_by
        }
      ] : []
    )
  );
}
export function emailRowWrittenOf(report, stepId) {
  return report?.steps.find((x) => x.id === stepId)?.written ?? null;
}
export const EMAIL_TEMPLATE_LIST_WORDS = {
  /** Said after WhatsApp's hover when the head's count takes email rows too. */
  headTip: (emails) => emails > 0 ? `The count takes ${plural(emails, "email")} of your sequences to leads too: their own words, sent by email, with no review.` : "",
  failed: "your emails to leads"
};
