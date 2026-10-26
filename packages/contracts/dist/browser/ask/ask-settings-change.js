import { clipAtWord } from "../conversations/message-words.js";
import { VISION_SWITCH_WORDS } from "../config/business-tab/abilities.js";
import { newReceptionistDefaults } from "../config/workspace-config/brain-config.js";
import { FALLBACK_DEFAULTS, FALLBACK_ROWS } from "../config/workspace-config/fallbacks.js";
import { instructionsDraft } from "../config/workspace-config/resolve.js";
import { formatPhoneDisplay, handoffE164 } from "../shared/phone.js";
import { phoneVoiceOf } from "../voice/phone-voices.js";
import { PHONE_PACE_WORDS } from "../voice/phone-pace.js";
import { WALK_IN_WORDS } from "../config/business-tab/choices.js";
const NOTE_TEXT_SAID_MAX = 160;
export const GUARDRAIL_RULES = ["never_quote_prices", "never_confirm_booking", "no_health_advice"];
export const GUARDRAIL_RULE_WORDS = {
  never_quote_prices: { on: "It never says a price", off: "It says the prices on your list" },
  never_confirm_booking: { on: "It never confirms a booking itself", off: "It may confirm a booking itself" },
  no_health_advice: { on: "It gives no health advice", off: "It may answer health questions" }
};
export const ASK_ANSWERS_ROWS = {
  set_tone: "tone",
  set_languages: "languages",
  set_phone_greeting: "phone_greeting",
  set_phone_voice: "phone_voice",
  set_transfer_number: "handoff_number",
  add_own_words: "extra_instructions",
  set_message: "fallbacks",
  set_photos: null,
  set_assistant_name: "assistant_name",
  set_phone_pace: "phone_pace",
  set_walk_ins: "walk_ins"
};
export const ASK_ANSWERS_PANE = { set_walk_ins: "hours" };
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
  if (isFixChange(change)) {
    brain.profile = profileWithFix(profile, change);
    return { ...config, brain };
  }
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
      services.push({
        name: change.name,
        ...change.duration_min ? { duration_min: change.duration_min } : {},
        ...change.price_note ? { price_note: change.price_note } : {}
      });
      profile.services = services;
      break;
    }
  }
  brain.profile = profile;
  return { ...config, brain };
}
const storedKeysOf = (v) => v && typeof v === "object" ? v : {};
const storedWordsOf = (v) => typeof v === "string" ? v : "";
function isFixChange(change) {
  return change.op === "set_service" || change.op === "add_escalate_when" || change.op === "set_guardrail";
}
function profileWithFix(profile, change) {
  switch (change.op) {
    case "set_service":
      return { ...profile, services: servicesWith(profile.services, change) };
    case "add_escalate_when": {
      const reasons = [...profile.escalate_when ?? []];
      const reason = change.reason.trim();
      if (reason && !reasons.some((r) => r.trim().toLowerCase() === reason.toLowerCase())) reasons.push(reason);
      return { ...profile, escalate_when: reasons };
    }
    case "set_guardrail":
      return { ...profile, guardrails: { ...storedKeysOf(profile.guardrails), [change.rule]: change.on } };
  }
}
function servicesWith(list, change) {
  const services = [...list ?? []];
  const key = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const at = services.findIndex(
    (s) => !!s && typeof s === "object" && key(storedWordsOf(s.name)) === key(change.name)
  );
  const fields = {
    ...change.duration_min ? { duration_min: change.duration_min } : {},
    ...change.price_note ? { price_note: change.price_note } : {}
  };
  if (at < 0) services.push({ name: change.name, ...fields });
  else services[at] = { ...services[at], ...fields };
  return services;
}
const BRAIN_OPS = /* @__PURE__ */ new Set([
  "set_tone",
  "set_languages",
  "set_phone_greeting",
  "set_phone_voice",
  "set_transfer_number",
  "add_own_words",
  "set_message",
  "set_assistant_name",
  "set_phone_pace",
  "set_walk_ins"
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
    case "set_assistant_name":
      putKey(profile, "assistant_name", change.name.replace(/\s+/g, " ").trim() || void 0);
      break;
    // Natural is no key: the line keeps its own pace (phone-pace.ts), as Settings' row stores it.
    case "set_phone_pace":
      putKey(profile, "phone_pace", change.pace === "natural" ? void 0 : change.pace);
      break;
    // One key of the booking rules, the rest kept; "unset" takes it away (choices.ts WALK_INS_CHOICES).
    case "set_walk_ins": {
      const rules = { ...storedKeysOf(profile.booking_rules) };
      putKey(rules, "walk_ins", change.walk_ins === "unset" ? void 0 : change.walk_ins);
      putKey(profile, "booking_rules", Object.keys(rules).length ? rules : void 0);
      break;
    }
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
    case "set_assistant_name": {
      const name = change.name.replace(/\s+/g, " ").trim();
      return name ? `It introduces itself as ${name}` : "It has no name: it says it's the automated assistant";
    }
    case "set_phone_pace":
      return PHONE_PACE_WORDS.saved(change.pace).replace(/\.$/, "");
    case "set_walk_ins":
      return WALK_IN_WORDS.saved(change.walk_ins).replace(/\.$/, "");
  }
}
export function serviceTail(s) {
  const minutes = s.duration_min ? s.duration_min >= 60 && s.duration_min % 30 === 0 ? `about ${s.duration_min / 60} h` : `${s.duration_min} min` : null;
  return [s.price_note?.trim() || null, minutes].filter(Boolean).map((p) => ` \xB7 ${p}`).join("");
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
      return `New service: ${change.name}${serviceTail(change)}`;
    case "set_service":
      return `${change.name}${serviceTail(change) || ", as it is"}`;
    case "add_escalate_when":
      return `Put through to you: ${quoted(change.reason)}`;
    case "set_guardrail":
      return GUARDRAIL_RULE_WORDS[change.rule][change.on ? "on" : "off"];
    case "set_goal":
      return change.goal.trim() ? `Your goal: \u201C${change.goal.trim()}\u201D` : "Your goal, taken away";
    case "set_booking_link":
      return change.link.trim() ? `Your booking link: ${change.link.trim()}` : "Your booking link, taken away";
    default:
      return describeAnswersChange(change);
  }
}
