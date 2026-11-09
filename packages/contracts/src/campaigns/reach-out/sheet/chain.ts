/** Sheet: chain. */

import { mailboxDailyCap } from "../../../email/mailbox-standing";
import { runApproveWords } from "../../../shell/campaign-rooms";
import { plural } from "../../../shared/words";
import type { ReachOutChainDto, ReachOutChainReportDto, ReachOutReachDto, ReachOutRunDto } from "../dtos";
import { REACH_OUT_DRAFTS_PER_DAY } from "../rules";
import { SEND_DAY_FRAME } from "../timetable";
import { pct } from "../../../shared/numbers";
import { heldAnswersOf, heldOwnWordsOf, heldWhyOf, markedOpeningOf } from "../../sequences/held";
import { dateFormat } from "../../../shared/time";
import {
  REACH_OUT_SHEET_WORDS,
  runDockOf,
  runFromLine,
  runFromOf,
  runPartsOf,
  stepLabel,
  stepLabelOf,
  type RunState,
} from "./words";

/**
 * The first ready business's email, in its parts: the opening (its own for each) marked, then the rest, the same for all,
 * its paragraphs kept, as the email card draws them (an email reads as one: the opening is its own paragraph).
 */
function runWordsOf(r: ReachOutRunDto): Array<{ text: string; opening: boolean }> {
  const words: Array<{ text: string; opening: boolean }> = [];
  if (!r.first) return words;
  const open = r.first.opening;
  const leads = !!open && r.first.body.startsWith(open);
  const rest = leads ? r.first.body.slice(open.length) : r.first.body;
  if (leads) words.push({ text: open, opening: true });
  if (rest.trim()) words.push({ text: leads ? rest.replace(/^[ \t]+/, "") : rest.trim(), opening: false });
  return words;
}

/** What the held card says under its head: whose say it waits for, and what the run does without them. */
function heldNoteWords(held: number, each: boolean, ready: number, owner: boolean, waiting: boolean): string {
  const lead = `${held === 1 ? "It waits" : each ? "Each waits" : "They wait"} for your say`;
  if (!waiting) return owner ? `${lead}.` : `${lead}; the run goes on without them.`;
  return ready > 0 && !owner ? `${lead}. Approve sends only the ${ready} ready.` : `${lead}.`;
}

/**
 * A run to leads, as its screen decides it (F13; R21, R22; the run-to-leads canvas of 19 Oct 2026): the decision first, how
 * many go and of how many, in one bar by count, and when and from where; the held as one card with its rows; the first
 * ready business's email as an email; what was checked; and the foot's line and Approve. `today` is the workspace's date
 * and `now` the moment it is said: a run from an earlier day goes from now, re-timed in their hours, and one whose first
 * time has passed today goes from now; never a time already past. `state` is the run's own, waiting unless said.
 */
export function approvalWordsOf(
  reachOutRun: ReachOutRunDto,
  params: { timezone: string; today: string; now: number; state?: RunState },
) {
  const state: RunState = params.state ?? "pending_approval";
  const waiting = state === "pending_approval";
  const owner = reachOutRun.owner_sends === true;
  const { earlier, from } = runFromOf(reachOutRun, params);
  const total = reachOutRun.today + reachOutRun.later;
  // An owner's emails already handed to them are this run's too (00429): counted with what is still to come.
  const ready = reachOutRun.today + (owner ? (reachOutRun.drafted?.length ?? 0) : 0);
  const held = reachOutRun.held.length;
  // Nothing today, and some in the coming days: the decision says those, as Approve releases them.
  const soon = ready === 0 && reachOutRun.later > 0;
  const count = soon ? reachOutRun.later : ready;
  const words = runWordsOf(reachOutRun);
  // A run whose step was dropped from its chain since (R17) says so, never another step's name.
  const step =
    reachOutRun.step_n === null
      ? "a step since removed"
      : `step ${reachOutRun.step_n + 1}, ${stepLabel(reachOutRun.step_n).toLowerCase()}`;
  const pace = `one every ${reachOutRun.gap_minutes} minutes as each business opens`;
  const unrun = reachOutRun.held.filter((h) => h.reason === "check_unavailable" && h.detail === null).length;
  // Its step, from 1: a held email's no at step 1 is Take out, since skipping it would end their place (00459).
  const place = reachOutRun.step_n === null ? null : reachOutRun.step_n + 1;
  return {
    title: reachOutRun.chain_name,
    step: reachOutRun.step_n === null ? "A step since removed" : `Step ${reachOutRun.step_n + 1}`,
    who: owner ? "You send them" : null,
    count: {
      n: count,
      words: owner
        ? "for you to send"
        : soon
          ? "go in the coming days"
          : state === "sending"
            ? "going today"
            : "go today",
      of: `of ${ready + reachOutRun.later + held + reachOutRun.checking}`,
    },
    parts: runPartsOf(reachOutRun, ready, state),
    // An owner's run is handed to them as each is checked, at any hour (00429): their hours are theirs to keep.
    when: owner
      ? { lead: "From your own inbox", rest: "each handed to you once it is checked" }
      : state === "sending"
        ? { lead: "Going now", rest: pace }
        : {
            lead: from ? `From ${from}` : "In their hours",
            rest: earlier ? `re-timed in their hours · ${pace}` : from ? `in their hours · ${pace}` : pace,
          },
    from: runFromLine(reachOutRun),
    rules: [
      ...(reachOutRun.include_unconfirmed ? [] : ["Each has a checked address"]),
      "None is on a person in People",
      "None heard from you before",
    ],
    words,
    mail: reachOutRun.first
      ? {
          name: reachOutRun.first.business_name,
          as: `As they read it · ${step}`,
          subject: reachOutRun.first.subject,
          opening: words.some((w) => w.opening) ? "Opening: its own for each" : null,
          same: total > 1 ? `Offer and ask: the same for all ${total}` : null,
          // How it ends, as they read it (0077): the mailbox's signature where it signs with one, then the send's foot.
          signature: reachOutRun.first.signature?.trim() || null,
          foot: reachOutRun.first.foot?.trim() || null,
        }
      : null,
    heldHead: `${held} held by the check`,
    // Closed it says "They wait", opened "Each waits" (the canvas's boards 1 and 2); a member who may not answer is
    // told whose say it is.
    heldNote: {
      closed: heldNoteWords(held, false, ready, owner, waiting),
      open: heldNoteWords(held, true, ready, owner, waiting),
      gated: `${held === 1 ? "It waits" : "Each waits"} for an owner's or operator's say.`,
    },
    recheck: unrun > 0 ? { said: `The check couldn't run for ${unrun}`, act: REACH_OUT_SHEET_WORDS.recheck } : null,
    held: reachOutRun.held.map((item) => {
      const row = {
        id: item.send_id,
        name: item.business_name,
        // Its lead's id, which the sheet's name opens over the page; none from a read before the lead was carried.
        leadId: item.lead_id || null,
        why: heldWhyOf(item.reason, item.detail),
        // The opening it would send, what the check refused marked in it: read before the say (30 Oct 2026).
        opening: markedOpeningOf(item.opening, { reason: item.reason, detail: item.detail }),
        // Take out is the leave verb, which names the lead: a read from before the lead was carried has none to take out.
        answers: heldAnswersOf({ reason: item.reason, detail: item.detail }, place).filter(
          (a) => a.door !== "take_out" || !!item.lead_id,
        ),
      };
      return item.own ? { ...heldOwnWordsOf(row), opening: null } : row;
    }),
    dock: runDockOf(reachOutRun, { ready, from, state }),
    // The count it releases ("Approve all 30"); when it goes is the foot's line beside it, never in it.
    approve: waiting ? runApproveWords(count) : null,
    // What a member who may not approve is told it waits for, in the foot where Approve would be.
    waits: { lead: `${count} go once it's approved`, said: "An owner or operator approves" },
    note: "Skipping loses this run only. The sequence keeps its place and asks again tomorrow.",
  };
}

/** A run's day as its history line says it: "Sep 24". */
const runDayWords = (runFor: string): string =>
  dateFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${runFor}T12:00:00Z`));

/**
 * A chain's pace as its mailboxes allow it: how many a day across them, and the one mailbox's address when it writes
 * from one. Each mailbox gives its day (contracts mailboxDailyCap), never more than fits in the working day at the
 * chain's gap (SEND_DAY_FRAME, nine to five in the lead's time: the timetable places no more), so the sheet, the report
 * and the approval say the number the timetable plans. Nothing to write from is a share of 0 and no address. A chain its
 * owner sends hands them its day's share, from no mailbox (00429).
 */
export function chainPaceOf(reachOutChain: Pick<ReachOutChainDto, "mailboxes" | "owner_sends" | "gap_minutes">): {
  from: string | null;
  share: number;
} {
  if (reachOutChain.owner_sends) return { from: null, share: REACH_OUT_DRAFTS_PER_DAY };
  const [only, ...others] = reachOutChain.mailboxes;
  const fits = Math.floor((SEND_DAY_FRAME.to - SEND_DAY_FRAME.from) / Math.max(1, reachOutChain.gap_minutes || 1)) + 1;
  return {
    from: only && others.length === 0 ? only.address : null,
    share: reachOutChain.mailboxes.reduce((t, m) => t + Math.min(mailboxDailyCap(m), fits), 0),
  };
}

/** The chain drawn as its steps, each after the one before by its days, and what stops it (the open row's first line). */
export function chainPathWords(reachOutChain: Pick<ReachOutChainDto, "steps">) {
  return {
    steps: reachOutChain.steps.map((s) => ({
      id: s.id,
      label: stepLabelOf(s),
      after: s.n === 0 ? null : `after ${s.after_days ?? "?"} days, nothing back`,
    })),
    stops: "Stops for anyone who writes back, books or says no.",
  };
}

/** What Playbooks' chain row says around its acts (PR 8). */
export const REACH_OUT_ROW_WORDS = {
  reading: "Reading how it is doing…",
  failed: "how this sequence is doing",
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
export function chainHintOf(reachOutChain: ReachOutChainDto, from: string | null): string {
  const labels = reachOutChain.steps.map((s) => stepLabelOf(s).toLowerCase());
  const by = reachOutChain.owner_sends ? " · you send them" : from ? ` · from ${from}` : "";
  return `${labels.join(", ").replace(/^your email/, "Your email")}${by}`;
}

/**
 * One step's line in the open row's table: an email's counts, or what a call or a note handed to you, which writes
 * nothing and is answered by nobody.
 */
function reportRowOf(
  chainReport: ReachOutChainReportDto["steps"][number],
  step: Pick<ReachOutChainDto["steps"][number], "after_days" | "hand"> | undefined,
): string[] {
  const label = stepLabelOf({ n: chainReport.n, hand: step?.hand ?? null });
  const when =
    chainReport.n === 0 ? "Day one, in their hours" : `After ${step?.after_days ?? "?"} days with nothing back`;
  if (step?.hand) return [label, when, `${chainReport.handed ?? 0} handed to you`, "—", "—", "—", "—", "—", "—"];
  return [
    label,
    when,
    String(chainReport.written),
    `${chainReport.delivered} (${pct(chainReport.delivered, chainReport.written) ?? 0}%)`,
    `${chainReport.wrote_back} (${pct(chainReport.wrote_back, chainReport.written) ?? 0}%)`,
    // Interested and booked (Part 6, H7): absent from a report read before 00241, and then unknown, never a zero.
    chainReport.interested === undefined ? "—" : String(chainReport.interested),
    chainReport.booked === undefined ? "—" : String(chainReport.booked),
    String(chainReport.said_no),
    String(chainReport.bounced),
  ];
}

/** The open row: the chain's report said (R23), and whether it may be removed (R16). */
export function chainReportWordsOf(
  reachOutChain: ReachOutChainDto,
  report: ReachOutChainReportDto,
  reach: ReachOutReachDto,
  params: { from: string | null; share: number },
) {
  const sum = (k: "written" | "wrote_back" | "said_no" | "bounced" | "held" | "handed") =>
    report.steps.reduce((t, s) => t + (s[k] ?? 0), 0);
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
  const stepOf = new Map(reachOutChain.steps.map((s) => [s.id, s]));
  return {
    // Who the chain has reached or will: its first step's written, waiting and held, and the search's still ready.
    reaches: {
      n: reach.ready + (first?.written ?? 0) + (first?.waiting ?? 0) + (first?.held ?? 0),
      of: `of ${reach.of} on the search`,
    },
    head: ["Step", "When", "Written", "Delivered", "Wrote back", "Interested", "Booked", "Said no", "Bounced"],
    table: report.steps.map((s) => reportRowOf(s, stepOf.get(s.id))),
    sentence: reachOutChain.owner_sends
      ? `You send these from your own inbox, up to ${params.share} a day handed to you. ${clauses.join("; ")}.`
      : params.share > 0
        ? `${params.share} a day${params.from ? ` from ${params.from}` : ""}, one every ${reachOutChain.gap_minutes} minutes in each business's hours. ${clauses.join("; ")}.`
        : `${REACH_OUT_SHEET_WORDS.noMailbox} ${clauses.join("; ")}.`,
    // The held wait for their owner in their run (R20): the newest run that holds some opens them.
    waiting:
      held > 0 ? { text: `${held} wait for your say`, run_id: report.runs.find((r) => r.held > 0)?.id ?? null } : null,
    history: report.runs.map((r) => ({
      id: r.id,
      text: `${r.run_for ? runDayWords(r.run_for) : "A run"} · ${(r.handed ?? 0) > 0 ? `${r.handed} handed to you` : `${r.written} written`}${r.held > 0 ? ` · ${r.held} held` : ""}`,
    })),
    stopOne: REACH_OUT_SHEET_WORDS.stopOne,
    canRemove: report.can_remove,
    remove: report.can_remove ? REACH_OUT_SHEET_WORDS.removeNote : null,
  };
}

/**
 * Templates' words for a reach-out step's email (F15; canvas board 14; R19; One message, every channel, step 5): the
 * email is a message with one version, the email, written where it is read; what sends it is its chain.
 */
export function emailTemplateWords(params: { chainName: string; stepN: number; afterDays: number | null }) {
  return {
    chip: "Email",
    sends: params.chainName,
    sendsNote:
      params.stepN === 0
        ? "step 1 · writes daily, in their hours"
        : `step ${params.stepN + 1} · after ${params.afterDays} days with nothing back`,
    /** The fold the check is read under, where its sentence stood open under every email (the fitted sheets). */
    checkLabel: "What is checked before each send",
    checkNote:
      "Checked before each send: every slot filled or the email held; the opening's facts in the finder's record; under 120 words; the footer present; the language theirs.",
    /** The act that opens the whole reach-out, whose days, pace and mailboxes are its own. */
    edit: "Edit the sequence",
  };
}

/** One email of a reach-out as Templates lists it (R19): its words, and the chain and step that send it. */
interface EmailTemplateLine {
  template_id: string;
  step_id: string;
  subject: string | null;
  body: string;
  root_id: string;
  chain_name: string;
  step_n: number;
  after_days: number | null;
  /** The name the chain signs with, which {{your name}} fills. */
  signed_by: string | null;
}

/**
 * Templates' email rows (R19), from the chains as `GET reach-outs` lists them: each step with words is one row, in its
 * chain's order. How many each has written is its chain's report, read when the row opens (R23), never here: the list
 * costs no count.
 */
export function emailTemplateRowsOf(chains: readonly ReachOutChainDto[]): EmailTemplateLine[] {
  return chains.flatMap((chain) =>
    chain.steps.flatMap((step) =>
      step.template_id
        ? [
            {
              template_id: step.template_id,
              step_id: step.id,
              subject: step.subject,
              body: step.body,
              root_id: chain.root_id,
              chain_name: chain.name,
              step_n: step.n,
              after_days: step.after_days,
              signed_by: chain.signed_by,
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
      ? `The count takes ${plural(emails, "email")} of your sequences to leads too: their own words, sent by email, with no review.`
      : "",
  failed: "your emails to leads",
} as const;
