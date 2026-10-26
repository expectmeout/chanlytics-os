import { formatPhoneDisplay } from "../shared/phone.js";
import { greetingOf } from "../voice/greeting-owner.js";
import { initialsOf } from "../conversations/thread-contact.js";
import { openWeekWords } from "../config/business-tab/open-week.js";
import { servicesWords } from "../config/business-tab/services-words.js";
import { TONE_PRESETS, personalityOf } from "../config/business-tab/how-it-answers.js";
import { phoneVoiceShown } from "../voice/phone-voices.js";
export function businessNameOf(receptionistName, workspaceName) {
  return (receptionistName ?? "").trim() || (workspaceName ?? "").trim() || null;
}
const linkShown = (url) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
function cardGreeting(spoken, profile, setup) {
  const stored = profile?.phone_greeting ?? setup.business.phone_greeting ?? null;
  return greetingOf({ name: spoken, stored, paused: false, assistant: profile?.assistant_name ?? null }).text;
}
export function soundsWords(profile) {
  const voice = phoneVoiceShown(profile?.phone_voice).name;
  const p = personalityOf(profile?.tone);
  const personality = p ? TONE_PRESETS.find((t) => t.key === p)?.label ?? null : profile?.tone ? "Your own words" : null;
  const name = (profile?.assistant_name ?? "").trim() || null;
  return [voice, personality, name].filter(Boolean).join(" \xB7 ");
}
function cardStatusOf(i) {
  if (!i.answering) return { state: "not_started", words: "Not answering yet" };
  const tried = !!(i.setup.channels.voice.lastInboundAt || i.setup.channels.whatsapp.lastInboundAt);
  return tried ? { state: "ready", words: "Answering" } : { state: "waiting_you", words: "Answering \xB7 not tried yet" };
}
const shownNumber = (n) => n ? formatPhoneDisplay(n) ?? n : null;
function cardRowsOf(i) {
  const b = i.brain;
  const p = b?.profile ?? null;
  const sv = servicesWords(p?.services ?? null);
  const kept = i.numbers?.keptLine ?? null;
  const line = i.numbers?.voiceLine ?? i.setup.channels.voice.number ?? null;
  const through = i.numbers?.handoff ?? i.setup.business.handoff ?? null;
  const show = shownNumber;
  const takesDetails = !!b && !b.booking_link;
  return [
    { key: "open", label: "Open", value: i.setup.business.hours && p?.hours ? openWeekWords(p.hours, i.tz) : null },
    {
      key: "knows",
      label: "Knows",
      value: sv.count ? [sv.chips.map((c) => c.name).join(", "), sv.more].filter(Boolean).join(" ") : null
    },
    takesDetails ? { key: "books", label: "To book", value: "Takes their details" } : { key: "books", label: "Books with", value: b?.booking_link ? linkShown(b.booking_link) : null },
    { key: "speaks", label: "Speaks", value: p?.languages?.length ? p.languages.join(", ") : null },
    // The line it answers, and the number set to forward to it, as recorded: no claim about when a call forwards.
    {
      key: "answers",
      label: "Answers",
      value: line ? kept ? `${show(line)}, and calls forwarded from ${show(kept)}` : show(line) : null
    },
    { key: "through", label: "Puts through to", value: show(through) }
  ];
}
export function receptionistCardOf(i) {
  const b = i.brain;
  const p = b?.profile ?? null;
  const spoken = (b?.business_name || i.setup.business.name || "").trim();
  const name = businessNameOf(spoken, i.workspaceName) ?? "";
  const assistant = (p?.assistant_name ?? "").trim() || null;
  const status = cardStatusOf(i);
  return {
    caption: "Your receptionist, so far",
    initials: assistant ? initialsOf(assistant) : name ? initialsOf(name) : "",
    name: name || "Your receptionist",
    assistant,
    status,
    strip: `${assistant ?? "Your receptionist"} \xB7 ${status.words}`,
    greetingLabel: "Greets every caller with",
    greeting: cardGreeting(spoken, p, i.setup),
    sounds: soundsWords(p),
    rows: cardRowsOf(i),
    foot: "Fills in as you go. You can change any of it later in Settings."
  };
}
