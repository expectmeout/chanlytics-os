import { clipAtWord } from "../conversations/message-words.js";
import { VISION_SWITCH_WORDS } from "../config/business-tab/abilities.js";
import { newReceptionistDefaults } from "../config/workspace-config/brain-config.js";
import { FALLBACK_DEFAULTS, FALLBACK_ROWS } from "../config/workspace-config/fallbacks.js";
import { instructionsDraft } from "../config/workspace-config/resolve.js";
import { formatPhoneDisplay, handoffE164 } from "../shared/phone.js";
import { phoneVoiceOf } from "../voice/phone-voices.js";
const NOTE_TEXT_SAID_MAX = 160;
export const ASK_ANSWERS_ROWS = {
  set_tone: "tone",
  set_languages: "languages",
  set_phone_greeting: "phone_greeting",
  set_phone_voice: "phone_voice",
  set_transfer_number: "handoff_number",
  add_own_words: "extra_instructions",
  set_message: "fallbacks",
  set_photos: null
};
const languagesOf = (list) => [
  ...new Set(list.map((l) => l.trim()).filter((l) => l !== ""))
];
export function applySettingsChange(config, change) {
  if (change.op === "set_photos")
    return {
      ...config,
      features: { ...config.features ?? {}, vision: change.on }
    };
  if (isAnswersBrainChange(change)) return applyAnswersChange(config, change);
  if (change.op === "set_goal") {
    const ask = { ...config.ask ?? {} };
    const goal = change.goal.trim();
    if (goal) ask.goal = goal;
    else delete ask.goal;
    return { ...config, ask };
  }
  if (change.op === "set_booking_link") {
    const brain2 = { ...config.brain ?? {} };
    const link = change.link.trim();
    if (link) brain2.booking_link = link;
    else delete brain2.booking_link;
    return { ...config, brain: brain2 };
  }
  const brain = { ...config.brain ?? {} };
  const profile = { ...brain.profile ?? {} };
  switch (change.op) {
    case "add_closure": {
      const closures = [...profile.closures ?? []];
      closures.push({
        date: change.date,
        ...change.until ? { until: change.until } : {},
        ...change.note ? { note: change.note } : {}
      });
      profile.closures = closures;
      break;
    }
    case "set_hours": {
      const hours = { ...profile.hours ?? {} };
      hours[change.day] = change.open && change.close ? { open: change.open, close: change.close } : { open: null, close: null };
      profile.hours = hours;
      break;
    }
    case "add_note": {
      const notes = [...profile.notes ?? []];
      notes.push({ title: change.title, text: change.text, ...change.until ? { until: change.until } : {} });
      profile.notes = notes;
      break;
    }
    case "add_service": {
      const services = [...profile.services ?? []];
      services.push({ name: change.name, ...change.duration_min ? { duration_min: change.duration_min } : {} });
      profile.services = services;
      break;
    }
  }
  brain.profile = profile;
  return { ...config, brain };
}
const BRAIN_OPS = /* @__PURE__ */ new Set([
  "set_tone",
  "set_languages",
  "set_phone_greeting",
  "set_phone_voice",
  "set_transfer_number",
  "add_own_words",
  "set_message"
]);
const isAnswersBrainChange = (change) => BRAIN_OPS.has(change.op);
const putKey = (profile, key, value) => {
  if (value === void 0) delete profile[key];
  else profile[key] = value;
};
function applyAnswersChange(config, change) {
  const brain = { ...config.brain ?? {} };
  const profile = { ...brain.profile ?? {} };
  switch (change.op) {
    case "set_tone":
      putKey(profile, "tone", change.tone.trim() || void 0);
      break;
    case "set_languages": {
      const list = languagesOf(change.languages);
      putKey(profile, "languages", list.length ? list : void 0);
      break;
    }
    // Emptied, the standard greeting. The standard line typed out is made empty by the tool that proposes it (act/settings.ts),
    // as the row's own save stores it: the check reads the greeting's disclosure rules, which stay out of the tab's bundle.
    case "set_phone_greeting":
      putKey(profile, "phone_greeting", change.greeting.trim() || void 0);
      break;
    case "set_phone_voice":
      putKey(profile, "phone_voice", change.voice);
      break;
    case "set_transfer_number":
      putKey(profile, "handoff_number", handoffE164(change.number) ?? void 0);
      break;
    case "add_own_words": {
      const now = instructionsDraft({ ...brain, profile }).text.trim();
      putKey(profile, "extra_instructions", [now, change.text.trim()].filter(Boolean).join("\n\n"));
      brain.system_prompt = newReceptionistDefaults(brain.business_name || "").system_prompt;
      break;
    }
    case "set_message":
      brain.fallbacks = {
        ...FALLBACK_DEFAULTS,
        ...brain.fallbacks ?? {},
        [change.which]: change.text.trim() || FALLBACK_DEFAULTS[change.which]
      };
      break;
  }
  brain.profile = profile;
  return { ...config, brain };
}
const WORDS_SAID_MAX = 160;
const quoted = (text) => `\u201C${clipAtWord(text.trim().replace(/\s+/g, " "), WORDS_SAID_MAX)}\u201D`;
const firstLower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
function describeAnswersChange(change) {
  switch (change.op) {
    case "set_tone":
      return change.tone.trim() ? `Its voice: ${quoted(change.tone)}` : "Its voice, taken away";
    case "set_languages": {
      const list = languagesOf(change.languages);
      return list.length ? `It speaks ${list.join(", ")}` : "No languages set";
    }
    case "set_phone_greeting":
      return change.greeting.trim() ? `Callers hear first: ${quoted(change.greeting)}` : "Callers hear the standard greeting";
    case "set_phone_voice": {
      const v = phoneVoiceOf(change.voice);
      return v ? `Callers hear ${v.name} (${v.says}) from their next call` : `Callers hear ${change.voice}`;
    }
    case "set_transfer_number": {
      const n = handoffE164(change.number);
      return n ? `Callers who insist on a person reach ${formatPhoneDisplay(n) ?? n}` : "Callers who insist on a person leave a message";
    }
    case "add_own_words":
      return `Added to your own words: ${quoted(change.text)}`;
    case "set_message": {
      const name = firstLower(FALLBACK_ROWS.find((r) => r.key === change.which)?.label ?? change.which);
      return change.text.trim() ? `When ${name}: ${quoted(change.text)}` : `When ${name}: the product's wording`;
    }
    case "set_photos":
      return VISION_SWITCH_WORDS.saved(change.on);
  }
}
export function describeSettingsChange(change) {
  switch (change.op) {
    case "add_closure":
      return change.until ? `Closed ${change.date} to ${change.until}${change.note ? ` (${change.note})` : ""}` : `Closed on ${change.date}${change.note ? ` (${change.note})` : ""}`;
    case "set_hours":
      return change.open && change.close ? `${change.day}: ${change.open}\u2013${change.close}` : `${change.day}: closed`;
    case "add_note": {
      const text = clipAtWord(change.text.replace(/\s+/g, " "), NOTE_TEXT_SAID_MAX);
      return `Note for the receptionist: \u201C${change.title}\u201D${change.until ? `, until ${change.until}` : ""}${text ? ` \u2014 \u201C${text}\u201D` : ""}`;
    }
    case "add_service":
      return `New service: ${change.name}${change.duration_min ? ` (${change.duration_min} min)` : ""}`;
    case "set_goal":
      return change.goal.trim() ? `Your goal: \u201C${change.goal.trim()}\u201D` : "Your goal, taken away";
    case "set_booking_link":
      return change.link.trim() ? `Your booking link: ${change.link.trim()}` : "Your booking link, taken away";
    default:
      return describeAnswersChange(change);
  }
}
