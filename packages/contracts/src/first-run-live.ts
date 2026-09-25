/**
 * The first run's last step, Live (docs/superpowers/plans/2026-09-24-first-run-5-try-live.md, 5b; canvas R9, P8, C2):
 * what the receptionist answers, who it puts callers through to, where it emails the owner and what it knows, the
 * greeting every caller hears, and the "you're live" email Finish sends. "It will / Not yet" is the Business tab's own
 * card (business-can.jsx), drawn as it is there. Every sentence is here; the page and the edge compose.
 */
import { formatPhoneDisplay } from "./phone";
import { greetingFor } from "./greeting";
import { forwardedLineOf, type SetupDto } from "./setup";

export interface FirstRunLiveVM {
  heading: string;
  lead: string;
  /** What the owner set up, in four lines; a line with nothing on record says so, and offers where to set it. */
  summary: {
    key: "answers" | "through" | "emails" | "knows";
    label: string;
    value: string;
    change: { label: string; to: string } | null;
  }[];
  /** "Every caller hears “…”": the greeting word for word (greeting.ts, the voice shell's own). */
  greeting: string;
  /** Finish, and, the first time calls are activated, the email it sends; null once they were activated before. */
  finish: { label: string; note: string | null };
}

export const FIRST_RUN_LIVE_WORDS = {
  heading: (business: string | null) =>
    business ? `${business}'s receptionist is answering` : "Your receptionist is answering",
  lead: "Every call shows up on Today and in your Inbox.",
  answers: "Answers",
  answersKept: (kept: string) => `${kept}, when nobody picks up`,
  through: "Puts callers through to",
  throughNobody: "Nobody: it takes a message and emails you",
  emails: "Emails you at",
  emailsTo: (to: string) => `${to}, when someone needs you`,
  emailsNobody: "Nobody yet",
  knows: "Knows",
  knowsNothing: "Only your name so far",
  change: "Change",
  greeting: (words: string) => `Every caller hears “${words}”`,
  finish: "Finish",
  finishNote: "We'll email you a copy of this.",
  /** The "you're live" email (canvas C2, decision 4): sent once, on the workspace's first activation of its calls. */
  emailSubject: (business: string | null) =>
    business ? `Your receptionist is answering ${business}'s calls` : "Your receptionist is answering your calls",
  emailTest: (length: string | null, from: string | null, through: string | null) =>
    `It answered your test call${length ? ` (${length})` : ""}${from ? ` from ${from}` : ""}${through ? ` through ${through}` : ""}.`,
  emailFrom: (kept: string | null, own: string | null) =>
    kept
      ? `From now on, calls to ${kept} that nobody picks up reach your receptionist.`
      : own
        ? `From now on, calls to ${own} reach your receptionist.`
        : "From now on, your receptionist answers your calls.",
  emailThrough: (to: string | null) =>
    to ? `A caller who asks for a person is put through to ${to}.` : "A caller who asks for a person leaves a message.",
  emailAlerts: "We'll email you here when someone needs you.",
  emailOpen: (url: string) => `Open Today: ${url}`,
} as const;

/** Sentences like "your hours, address, 4 services and your booking link", said as one list. */
function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export interface FirstRunLiveInput {
  dto: SetupDto;
  /** The workspace's alert addresses (the config's notifications.escalation_emails); empty for none or not read. */
  emails: readonly string[];
  /** The business's name as the receptionist says it. */
  business: string | null;
}

export function firstRunLiveOf({ dto, emails, business }: FirstRunLiveInput): FirstRunLiveVM {
  const W = FIRST_RUN_LIVE_WORDS;
  const own = dto.channels.voice.active ? formatPhoneDisplay(dto.channels.voice.number) : null;
  const kept = formatPhoneDisplay(forwardedLineOf(dto.lines)?.e164 ?? null);
  const handoff = formatPhoneDisplay(dto.business.handoff);
  const b = dto.business;
  const knows = [
    b.hours ? "your hours" : null,
    b.address ? "address" : null,
    b.services ? `${b.services} ${b.services === 1 ? "service" : "services"}` : null,
    b.bookingLink ? "your booking link" : null,
  ].filter((x): x is string => !!x);
  const knowsWords = listWords(knows);
  return {
    heading: W.heading(business),
    lead: W.lead,
    summary: [
      { key: "answers", label: W.answers, value: kept ? W.answersKept(kept) : (own ?? "—"), change: null },
      {
        key: "through",
        label: W.through,
        value: handoff ?? W.throughNobody,
        change: { label: W.change, to: "admin/workspace" },
      },
      {
        key: "emails",
        label: W.emails,
        value: emails.length ? W.emailsTo(emails.join(", ")) : W.emailsNobody,
        change: { label: W.change, to: "admin/notifications" },
      },
      {
        key: "knows",
        label: W.knows,
        value: knowsWords ? knowsWords.charAt(0).toUpperCase() + knowsWords.slice(1) : W.knowsNothing,
        change: { label: W.change, to: "admin/workspace" },
      },
    ],
    greeting: W.greeting(greetingFor(business)),
    // The email goes with the first activation of calls (the capability route): said only while there is none yet.
    finish: {
      label: W.finish,
      note: (dto.activations ?? []).some((a) => a.capability === "voice") ? null : W.finishNote,
    },
  };
}

export interface YouAreLiveInput {
  business: string | null;
  /** The receptionist's own number, and the kept number that forwards to it, E.164; null for none. */
  own: string | null;
  kept: string | null;
  /** Where a caller who asks for a person goes, E.164; null takes a message. */
  handoff: string | null;
  /** The test call: the newest inbound call that connected, when there is one. */
  test: { from: string | null; length: string | null; throughKept: boolean } | null;
  /** The workspace's Today, when the edge knows the dashboard's address. */
  todayUrl: string | null;
}

/** The "you're live" email (canvas C2): what the test call proved, what happens from now on, and where alerts go. */
export function youAreLiveEmail(i: YouAreLiveInput): { subject: string; body: string } {
  const W = FIRST_RUN_LIVE_WORDS;
  const own = formatPhoneDisplay(i.own);
  const kept = formatPhoneDisplay(i.kept);
  const lines = [
    i.test ? W.emailTest(i.test.length, formatPhoneDisplay(i.test.from), i.test.throughKept ? kept : null) : null,
    W.emailFrom(kept, own),
    W.emailThrough(formatPhoneDisplay(i.handoff)),
    W.emailAlerts,
    i.todayUrl ? W.emailOpen(i.todayUrl) : null,
  ].filter((x): x is string => !!x);
  return { subject: W.emailSubject(i.business), body: `${lines.join("\n\n")}\n` };
}
