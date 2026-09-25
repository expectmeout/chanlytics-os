/**
 * A run's report: its figures over time, the people it reached and what each said back. Moved whole from
 * broadcasts.ts (Reach out Part 2.5), which re-exports it.
 */
import { broadcastFailureFix, broadcastFailureWords } from "./broadcast-failures";
import type { BroadcastRecipientDto } from "./broadcasts";
import { HELD_REASONS } from "./run-words";
import type { ParamSpec } from "./templates";

/* ------------------------------ a run's report ------------------------------ */

export type RunFigureId = "sent" | "delivered" | "replied" | "said_yes" | "stopped";

/** The steps a figure's bars take: the canvas draws eight. */
export const RUN_REPORT_STEPS = 8;

/** The spans the bars can cover, in hours: the shortest that holds everything the run heard back, up to the reply window. */
const RUN_REPORT_SPANS_H = [1, 2, 4, 8, 12, 24, 48, 72];

export interface RunFigure {
  id: RunFigureId;
  label: string;
  n: number;
  /** Of what the run sent, rounded; null for "sent" itself, for none, and for a run that reached nobody. */
  pct: number | null;
  /** The sentence under the figure. */
  sub: string;
  /** "ok" for an answer that came, "warn" for a stop -- the one figure that asks the owner to look -- and plain for none. */
  tone: "plain" | "ok" | "warn";
  /** When each came back, in RUN_REPORT_STEPS equal steps from the first send across the report's span. */
  bars: number[];
}

/** The filters over "Everyone it touched". */
export type RunFilterId = "all" | "replied" | "held" | "stopped";

export const RUN_FILTERS: readonly { id: RunFilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "replied", label: "Replied" },
  { id: "held", label: "Held back" },
  { id: "stopped", label: "Stopped" },
];

export type RunTone = "plain" | "ok" | "info" | "warn" | "danger";

/** One person's line: what happened to them, in words, with the one door it offers. */
export interface RunPersonVM {
  contact_id: string;
  name: string;
  /** Two letters for the mark, or a dash for someone with no name on file. */
  initials: string;
  pill: { label: string; tone: RunTone };
  words: string;
  door: { label: string; to: string } | null;
  /** The last thing that happened to them, by the business's clock; null for someone the run never sent to. */
  at: string | null;
  /** Their line asks the owner to look: a stop, or a greeting that went out "Hi there". */
  attn: boolean;
  /** The run never sent to them: held back, refused, or not yet. */
  held: boolean;
  in: RunFilterId[];
}

/** One reply, as "What came back" quotes it: their words, and what has happened since. */
export interface RunReplyVM {
  contact_id: string;
  name: string;
  initials: string;
  /** Their first reply's words; null when it had none. */
  quote: string | null;
  outcome: { words: string; tone: RunTone };
  to: string | null;
}

export interface RunReportVM {
  figures: RunFigure[];
  /** What the bars cover, in words: "the first 4 hours" -- the shortest span holding everything heard back, up to the window. */
  span: string;
  /** How many the run was for: everyone enrolled, reached or not. */
  enrolled: number;
  /** How many each filter of "Everyone it touched" holds. */
  groups: Record<RunFilterId, number>;
  people: RunPersonVM[];
  /** Every reply, the first to come first. */
  replies: RunReplyVM[];
  /** Why a failed run stopped and how to get past it; null for a run that did not fail. */
  stop: { words: string; fix: string | null; tone: "warn" | "danger" } | null;
}

type ReportRecipient = Pick<
  BroadcastRecipientDto,
  | "contact_id"
  | "name"
  | "first_name"
  | "state"
  | "reason"
  | "sent_at"
  | "message_status"
  | "conversation_id"
  | "delivered_at"
  | "read_at"
  | "replied"
  | "replied_at"
  | "consent_after"
  | "consent_at"
  | "consent_purpose"
  | "reply_words"
  | "answered_by"
  | "answered_at"
  | "waiting_on_you"
>;

/**
 * Which answer a yes or a stop was, said once for a person and once for a
 * figure: a stop to offers leaves every other message going, so the canvas's
 * "they hear nothing again" is only true of a stop to everything.
 */
export function consentAnswerWords(
  consent: "opted_in" | "opted_out",
  purpose: "marketing" | "conversational" | null,
): string {
  if (consent === "opted_in") return purpose === "marketing" ? "said yes to offers" : "said yes to hearing from you";
  return purpose === "marketing" ? "stopped offers, not messages" : "asked to stop hearing from you";
}

/** "said yes to offers", or both kinds counted apart: "1 to offers · 2 to hearing from you". */
function answersWords(rows: readonly ReportRecipient[], consent: "opted_in" | "opted_out"): string {
  const offers = rows.filter((r) => r.consent_purpose === "marketing").length;
  const rest = rows.length - offers;
  if (offers === 0 || rest === 0) return consentAnswerWords(consent, offers > 0 ? "marketing" : "conversational");
  return consent === "opted_in"
    ? `${offers} to offers · ${rest} to hearing from you`
    : `${offers} stopped offers · ${rest} stopped everything`;
}

const STATUS_WORDS: Record<string, string> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "not delivered",
  queued: "sending",
  canceled: "canceled",
};

/** What happened to one person, with the times WhatsApp's receipts gave (00111): "sent 10:31 · delivered 10:32 · read 10:40 · replied 10:52". */
export function receiptWords(
  r: Pick<BroadcastRecipientDto, "sent_at" | "message_status" | "delivered_at" | "read_at" | "replied" | "replied_at">,
  clock: (iso: string | null) => string | null,
): string {
  const parts: string[] = [];
  const sent = clock(r.sent_at);
  parts.push(
    sent ? `sent ${sent}` : (r.message_status && STATUS_WORDS[r.message_status]) || r.message_status || "sent",
  );
  const delivered = clock(r.delivered_at);
  const read = clock(r.read_at);
  if (delivered) parts.push(`delivered ${delivered}`);
  else if (r.message_status === "delivered" || r.message_status === "read") parts.push("delivered");
  if (read) parts.push(`read ${read}`);
  else if (r.message_status === "read") parts.push("read");
  if (r.message_status === "failed") parts.push("not delivered");
  if (r.replied) parts.push(clock(r.replied_at) ? `replied ${clock(r.replied_at)}` : "replied");
  return parts.join(" · ");
}

const initialsOf = (name: string, named: boolean): string =>
  named
    ? name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => Array.from(w)[0] ?? "")
        .join("")
        .toUpperCase() || "—"
    : "—";

/**
 * One run's report: the five figures Reports › Campaigns draws for the
 * workspace -- messages sent, delivered, replied, said yes, asked to stop --
 * scoped to this run, from its recipients; everyone it touched, each in the
 * words of what happened to them; every reply, quoted; and, for a failed run,
 * why it stopped and how to get past it.
 *
 * Delivered counts read too: a message read was delivered. Each figure's bars
 * say when its answers came, in eight equal steps from the first send across
 * the shortest span that holds everything the run heard back -- an hour, four,
 * a day, up to the reply window -- so replies that came in the first hour have
 * a shape instead of one bar, and a run whose answers trickled in over three
 * days looks like it.
 */
export function toRunReportVM(
  d: {
    broadcast?: { state?: string; failure?: string | null; params?: readonly ParamSpec[] };
    recipients: readonly ReportRecipient[];
  },
  opts: { windowMs: number; nowMs: number; clock?: (iso: string | null) => string | null },
): RunReportVM {
  const clock = opts.clock ?? ((iso: string | null) => iso);
  const reached = d.recipients.filter((r) => r.state === "sent");
  const sent = reached.length;
  const delivered = reached.filter((r) => r.message_status === "delivered" || r.message_status === "read");
  const replied = reached.filter((r) => r.replied);
  const waiting = replied.filter((r) => r.waiting_on_you).length;
  const yes = reached.filter((r) => r.consent_after === "opted_in");
  const stopped = reached.filter((r) => r.consent_after === "opted_out");
  const starts = reached.map((r) => (r.sent_at ? Date.parse(r.sent_at) : NaN)).filter(Number.isFinite);
  const start = starts.length ? Math.min(...starts) : opts.nowMs;
  const heard = reached
    .flatMap((r) => [r.delivered_at, r.read_at, r.replied ? r.replied_at : null, r.consent_after ? r.consent_at : null])
    .map((s) => (s ? Date.parse(s) : NaN))
    .filter((t) => Number.isFinite(t) && t >= start && t - start <= opts.windowMs);
  const last = heard.length ? Math.max(...heard) - start : 0;
  const windowH = opts.windowMs / 3_600_000;
  const spanH = RUN_REPORT_SPANS_H.find((h) => h <= windowH && h * 3_600_000 > last) ?? windowH;
  const step = (spanH * 3_600_000) / RUN_REPORT_STEPS;
  const bars = (stamps: (string | null)[]): number[] => {
    const out = new Array<number>(RUN_REPORT_STEPS).fill(0);
    for (const s of stamps) {
      const t = s ? Date.parse(s) : NaN;
      if (!Number.isFinite(t)) continue;
      const i = Math.floor((t - start) / step);
      if (i >= 0 && i < RUN_REPORT_STEPS) out[i]! += 1;
    }
    return out;
  };
  const pct = (n: number): number | null => (sent > 0 && n > 0 ? Math.round((n / sent) * 100) : null);
  const never = sent - delivered.length;
  // A first-name slot takes the wire's own first name for each person (firstNameOf), and "there" for someone with none.
  const greets = (d.broadcast?.params ?? []).some((p) => p && p.kind === "first_name");
  // A run that failed or was canceled leaves the people it had not reached queued (jobs settle.ts): they are not
  // "not sent yet" -- nothing more goes to them from this run.
  const state = d.broadcast?.state;
  const cutOff =
    state === "failed"
      ? "the run stopped before them"
      : state === "canceled"
        ? "canceled before it reached them"
        : state === "sent"
          ? "never sent"
          : null;

  const people: RunPersonVM[] = d.recipients.map((r) => {
    const out = r.state === "sent";
    const hiThere = out && greets && !r.first_name;
    const answer = r.consent_after ? consentAnswerWords(r.consent_after, r.consent_purpose) : null;
    const pill: RunPersonVM["pill"] =
      r.consent_after === "opted_out" && out
        ? { label: "Asked to stop", tone: "warn" }
        : r.replied && out
          ? { label: "Replied", tone: "ok" }
          : r.consent_after === "opted_in" && out
            ? { label: "Said yes", tone: "ok" }
            : r.state === "skipped"
              ? { label: "Held back", tone: "plain" }
              : r.state === "failed"
                ? { label: "Not sent", tone: "danger" }
                : r.state === "queued"
                  ? { label: cutOff ? "Not sent" : "Waiting", tone: "plain" }
                  : r.message_status === "failed"
                    ? { label: "Never delivered", tone: "danger" }
                    : r.message_status === "read"
                      ? { label: "Read", tone: "info" }
                      : r.message_status === "delivered"
                        ? { label: "Delivered", tone: "info" }
                        : { label: "Sent", tone: "plain" };
    const quote = r.replied && r.reply_words ? `“${r.reply_words}”` : null;
    const words =
      r.state === "skipped"
        ? (r.reason && HELD_REASONS[r.reason]) || r.reason || "held back"
        : r.state === "failed"
          ? (r.reason && HELD_REASONS[r.reason]) || HELD_REASONS.send_failed || "WhatsApp refused it"
          : r.state === "queued"
            ? (cutOff ?? "not sent yet")
            : r.consent_after === "opted_out"
              ? quote
                ? `${quote} — ${answer}`
                : answer!
              : quote
                ? quote
                : r.consent_after === "opted_in"
                  ? answer!
                  : r.message_status === "failed"
                    ? "WhatsApp could not deliver it"
                    : hiThere
                      ? "greeted “Hi there” — no name on file"
                      : receiptWords(r, clock);
    const door =
      r.consent_after === "opted_out" && out
        ? { label: "See consent", to: `clients/${r.contact_id}` }
        : hiThere
          ? { label: "Add a name", to: `clients/${r.contact_id}` }
          : r.replied && r.conversation_id
            ? { label: "Open the thread", to: `inbox/th-${r.conversation_id}` }
            : null;
    const inn: RunFilterId[] = ["all"];
    if (out && r.replied) inn.push("replied");
    if (r.state === "skipped" || r.state === "failed" || (r.state === "queued" && cutOff)) inn.push("held");
    if (out && r.consent_after === "opted_out") inn.push("stopped");
    return {
      contact_id: r.contact_id,
      name: r.name,
      initials: initialsOf(r.name, !!r.first_name),
      pill,
      words,
      door,
      at: out ? clock(r.replied_at || r.consent_at || r.read_at || r.delivered_at || r.sent_at) : null,
      attn: (out && r.consent_after === "opted_out") || hiThere,
      held: !out,
      in: inn,
    };
  });

  const replies: RunReplyVM[] = replied
    .slice()
    .sort((a, b) => String(a.replied_at ?? "").localeCompare(String(b.replied_at ?? "")))
    .map((r) => ({
      contact_id: r.contact_id,
      name: r.name,
      initials: initialsOf(r.name, !!r.first_name),
      quote: r.reply_words ? `“${r.reply_words}”` : null,
      outcome: r.waiting_on_you
        ? { words: "Waiting on you", tone: "warn" }
        : r.answered_by === "receptionist"
          ? {
              words: `The receptionist answered${clock(r.answered_at) ? ` · ${clock(r.answered_at)}` : ""}`,
              tone: "ok",
            }
          : r.answered_by === "team"
            ? { words: `Your team answered${clock(r.answered_at) ? ` · ${clock(r.answered_at)}` : ""}`, tone: "ok" }
            : { words: "Not answered yet", tone: "plain" },
      to: r.conversation_id ? `inbox/th-${r.conversation_id}` : null,
    }));

  const failed = d.broadcast?.state === "failed";
  const code = d.broadcast?.failure ?? null;
  return {
    enrolled: d.recipients.length,
    span:
      spanH === 1
        ? "the first hour"
        : spanH < 24
          ? `the first ${spanH} hours`
          : spanH === 24
            ? "the first day"
            : `the first ${spanH / 24} days`,
    groups: {
      all: people.length,
      replied: people.filter((p) => p.in.includes("replied")).length,
      held: people.filter((p) => p.in.includes("held")).length,
      stopped: people.filter((p) => p.in.includes("stopped")).length,
    },
    people,
    replies,
    stop: failed
      ? {
          words: broadcastFailureWords(code),
          fix: broadcastFailureFix(code, sent),
          tone: code === "paused" ? "warn" : "danger",
        }
      : null,
    figures: [
      {
        id: "sent",
        label: "Messages sent",
        n: sent,
        pct: null,
        sub: `of ${d.recipients.length} on the list`,
        tone: "plain",
        bars: bars(reached.map((r) => r.sent_at)),
      },
      {
        id: "delivered",
        label: "Delivered",
        n: delivered.length,
        pct: pct(delivered.length),
        sub:
          sent === 0
            ? "nothing has gone out"
            : never > 0
              ? `${never} never reached the handset`
              : "every one reached the handset",
        tone: delivered.length > 0 ? "ok" : "plain",
        bars: bars(delivered.map((r) => r.delivered_at ?? r.read_at)),
      },
      {
        id: "replied",
        label: "Replied",
        n: replied.length,
        pct: pct(replied.length),
        sub:
          waiting > 0
            ? `${waiting} waiting on you in the Inbox`
            : replied.length > 0
              ? "each one is a thread in the Inbox"
              : "nobody has written back yet",
        tone: replied.length > 0 ? "ok" : "plain",
        bars: bars(replied.map((r) => r.replied_at)),
      },
      {
        id: "said_yes",
        label: "Said yes",
        n: yes.length,
        pct: pct(yes.length),
        sub: yes.length > 0 ? answersWords(yes, "opted_in") : "nobody new said yes",
        tone: yes.length > 0 ? "ok" : "plain",
        bars: bars(yes.map((r) => r.consent_at)),
      },
      {
        id: "stopped",
        label: "Asked to stop",
        n: stopped.length,
        pct: pct(stopped.length),
        sub: stopped.length > 0 ? answersWords(stopped, "opted_out") : "nobody asked to stop",
        tone: stopped.length > 0 ? "warn" : "plain",
        bars: bars(stopped.map((r) => r.consent_at)),
      },
    ],
  };
}
