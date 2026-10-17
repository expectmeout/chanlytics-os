import { formatPhoneDisplay } from "../shared/phone.js";
import { greetingOf } from "../voice/greeting-owner.js";
import { forwardedLineOf } from "./setup.js";
export const FIRST_RUN_LIVE_WORDS = {
  heading: (business) => business ? `${business}'s receptionist is answering` : "Your receptionist is answering",
  lead: "Every call shows up on Today and in your Inbox.",
  answers: "Answers",
  answersKept: (kept) => `${kept}, when nobody picks up`,
  answersKeptAll: (kept) => `Every call to ${kept}`,
  through: "Puts callers through to",
  throughNobody: "Nobody: it takes a message and emails you",
  throughNobodyUnaddressed: "Nobody: it takes a message",
  emails: "Emails you at",
  emailsTo: (to) => `${to}, when someone needs you`,
  emailsNobody: "Nobody yet",
  knows: "Knows",
  knowsNothing: "Only your name so far",
  change: "Change",
  greeting: (words) => `Every caller hears \u201C${words}\u201D`,
  finishNote: "We'll email you a copy of this.",
  /** The "you're live" email (canvas C2, decision 4): sent once, on the workspace's first activation of its calls. */
  emailSubject: (business) => business ? `Your receptionist is answering ${business}'s calls` : "Your receptionist is answering your calls",
  emailTest: (length, from, through) => `It answered your test call${length ? ` (${length})` : ""}${from ? ` from ${from}` : ""}${through ? ` through ${through}` : ""}.`,
  emailFrom: (kept, own, always = false) => kept ? always ? `From now on, every call to ${kept} reaches your receptionist.` : `From now on, calls to ${kept} that nobody picks up reach your receptionist.` : own ? `From now on, calls to ${own} reach your receptionist.` : "From now on, your receptionist answers your calls.",
  emailThrough: (to) => to ? `A caller who asks for a person is put through to ${to}.` : "A caller who asks for a person leaves a message.",
  emailAlerts: "We'll email you here when someone needs you.",
  emailOpen: (url) => `Open Today: ${url}`
};
function listWords(parts) {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
export function firstRunLiveOf({ dto, emails, business, owner }) {
  const W = FIRST_RUN_LIVE_WORDS;
  const own = dto.channels.voice.active ? formatPhoneDisplay(dto.channels.voice.number) : null;
  const fw = forwardedLineOf(dto.lines);
  const kept = fw && fw.forwarding_state === "verified" ? formatPhoneDisplay(fw.e164) : null;
  const always = fw?.forwarding?.mode === "always";
  const handoff = formatPhoneDisplay(dto.business.handoff);
  const b = dto.business;
  const knows = [
    b.hours ? "your hours" : null,
    b.address ? "your address" : null,
    b.services ? `${b.services} ${b.services === 1 ? "service" : "services"}` : null,
    b.bookingLink ? "your booking link" : null
  ].filter((x) => !!x);
  const knowsWords = listWords(knows);
  return {
    heading: W.heading(business),
    lead: W.lead,
    summary: [
      {
        key: "answers",
        label: W.answers,
        value: kept ? always ? W.answersKeptAll(kept) : W.answersKept(kept) : own ?? "\u2014",
        change: null
      },
      {
        key: "through",
        label: W.through,
        value: handoff ?? (emails.length ? W.throughNobody : W.throughNobodyUnaddressed),
        change: { label: W.change, to: "admin/workspace" }
      },
      {
        key: "emails",
        label: W.emails,
        value: emails.length ? W.emailsTo(emails.join(", ")) : W.emailsNobody,
        change: { label: W.change, to: "admin/notifications" }
      },
      {
        key: "knows",
        label: W.knows,
        value: knowsWords ? knowsWords.charAt(0).toUpperCase() + knowsWords.slice(1) : W.knowsNothing,
        change: { label: W.change, to: "admin/workspace" }
      }
    ],
    greeting: W.greeting(greetingOf({ name: business, stored: dto.business.phone_greeting, paused: false }).text),
    // The email goes with the first run's first activation of calls (the capability route, first_run): said only
    // where it will go.
    finish: {
      note: owner && own && emails.length > 0 && !(dto.activations ?? []).some((a) => a.capability === "voice") ? W.finishNote : null
    }
  };
}
export function youAreLiveEmail(i) {
  const W = FIRST_RUN_LIVE_WORDS;
  const own = formatPhoneDisplay(i.own);
  const kept = formatPhoneDisplay(i.kept);
  const lines = [
    i.test ? W.emailTest(i.test.length, formatPhoneDisplay(i.test.from), kept) : null,
    W.emailFrom(kept, own, i.always),
    W.emailThrough(formatPhoneDisplay(i.handoff)),
    W.emailAlerts,
    i.todayUrl ? W.emailOpen(i.todayUrl) : null
  ].filter((x) => !!x);
  return { subject: W.emailSubject(i.business), body: `${lines.join("\n\n")}
` };
}
