import { GUARDRAIL_KEYS } from "../workspace-config/config-rules.js";
import { NO_FIELDS_COMPOSED_WORDS } from "../workspace-config/resolve.js";
export const ABILITY_CHANNEL_WORDS = {
  whatsapp: { has: "in chat", not: "not in chat" },
  voice: { has: "on a call", not: "not on a call" }
};
const channelOpens = (c) => {
  const w = ABILITY_CHANNEL_WORDS[c].has;
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const STRENGTHS = /* @__PURE__ */ (() => ({
  never_confirm_booking: {
    strength: "structural",
    chip: "Built in",
    sentence: "It can't make, move or cancel a booking anyway. Off only stops it being told not to claim it did.",
    checkedOn: null
  },
  never_quote_prices: {
    strength: "checked",
    chip: "Checked",
    // The sentence says the rule. `checkedOn` says how it lands per channel, and the
    // page draws both -- so the sentence must not say the channels too, or an owner
    // reads the same fact twice, once in prose and once in the two boxes under it.
    // Dollars and pesos are what `violatesNoPrices` knows. "A currency figure" promised
    // more: forty-five euros, or a pound sign, would pass it untouched.
    //
    // Decision 0051 (11 Oct 2026) reversed the owner's 20 Sep decision that a receptionist never states a price
    // whatever this switch says: off now lets it say the prices the owner wrote (priceAllowance), and only those. The
    // detectors (priceBreach on a chat reply, spokenBreach on a call) read every reply either way, so the sentence
    // names what is always true: a price nobody wrote never goes out. Switch-agnostic, so ruleStrength keeps its
    // one-argument shape; the switch's own state is said by rulesKept and the fold's list.
    sentence: "Every reply is checked for a price in dollars or pesos. On, it says none; off, it may say the ones you've written, and any other is swapped out.",
    checkedOn: [
      {
        channel: "whatsapp",
        label: channelOpens("whatsapp"),
        words: "a price it may not say is swapped out before the customer sees it."
      },
      {
        channel: "voice",
        label: channelOpens("voice"),
        // What ALWAYS holds is that the owner is told: a correction goes into the call only while its turns are
        // still being delivered, and with that switched off on the agent the same check runs on the final transcript
        // and the owner is told after the fact instead (policy.ts). "Degrading is the point", and the line degrades
        // with it rather than promising the better half of it.
        words: "it was already heard. You're told, and it corrects itself if the caller is still on."
      }
    ]
  },
  // Always on (decision 0051): the usage policy of the model it runs on asks every consumer-facing agent to say it is
  // AI, so this is no longer a switch (ALWAYS_TOLD). Told, and nothing checks the answer: there is no clean signal to
  // check against, since the phrase that would catch a denial also catches the correct disclosure.
  disclose_ai: {
    strength: "instructed",
    chip: "Told",
    sentence: "People should know who they're talking to. A call's greeting says it; in text it opens a new conversation saying so, and says it whenever asked. Nothing checks its answer.",
    checkedOn: null
  },
  no_health_advice: {
    strength: "instructed",
    chip: "Told",
    sentence: "It leaves health questions to a professional. It's told this, and nothing checks its answer.",
    checkedOn: null
  }
}))();
export function ruleStrength(key) {
  return STRENGTHS[key];
}
export const VISION_STRENGTH = /* @__PURE__ */ (() => ({
  strength: "power",
  chip: "gives it a power",
  // Two clauses, one per position, and nothing else. "The rules above are limits; this one gives it an ability, so
  // it starts off" went: the dashed rule above the switch says it is apart, the badge beside it says it is a power,
  // and the switch itself says it is off -- three sayings of one thing, and four lines of a phone.
  sentence: "Off, photos go to a person.",
  checkedOn: null
}))();
export const ALWAYS_TOLD = /* @__PURE__ */ new Set(["disclose_ai"]);
const PRICES_WRITTEN_WORDS = "Says only the prices you wrote";
export const RULES_AT_REST_WORDS = {
  never_quote_prices: "Never quotes a price",
  never_confirm_booking: "Never confirms a booking",
  disclose_ai: "Says it's an assistant",
  no_health_advice: "No health advice"
};
const CANNOT_BOOK_WORDS = "Cannot book anything";
const PHOTOS_AT_REST_WORDS = { on: "Looks at photos", off: "Won't look at photos" };
export function rulesKept(i) {
  if (typeof i?.vision !== "boolean" || typeof i?.composes !== "boolean") {
    throw new TypeError("rulesKept needs vision and composes as booleans, not what an untyped page left out.");
  }
  const rules = i.rules;
  if (!rules || typeof rules !== "object") throw new TypeError("rulesKept needs the four rules as guardrailsInForce.");
  for (const key of GUARDRAIL_KEYS) {
    if (typeof rules[key] !== "boolean") throw new TypeError(`rulesKept needs ${key} as a boolean.`);
  }
  const kept = [];
  for (const key of GUARDRAIL_KEYS) {
    const { strength } = ruleStrength(key);
    const told = i.composes && rules[key] || ALWAYS_TOLD.has(key);
    if (key === "never_quote_prices" && !rules[key] && i.composes) kept.push(PRICES_WRITTEN_WORDS);
    else if (strength === "checked" || told) kept.push(RULES_AT_REST_WORDS[key]);
    else if (strength === "structural") kept.push(CANNOT_BOOK_WORDS);
  }
  kept.push(i.vision ? PHOTOS_AT_REST_WORDS.on : PHOTOS_AT_REST_WORDS.off);
  return kept;
}
export const RULES_WITHOUT_FIELDS_WORDS = /* @__PURE__ */ (() => `${NO_FIELDS_COMPOSED_WORDS} Until they are, it isn't told these rules, only that it is an automated assistant.`)();
export function rulesWithoutFieldsWords() {
  return RULES_WITHOUT_FIELDS_WORDS;
}
const PRICES_NAMED = 6;
export function pricesWrittenWords(list) {
  if (!list) return null;
  if (!list.length) return "You haven't written a price yet. Add one to a service, and it may say it.";
  const named = list.slice(0, PRICES_NAMED).map((p) => `${p.figure} (${p.from})`).join(", ");
  const more = list.length > PRICES_NAMED ? ` and ${list.length - PRICES_NAMED} more` : "";
  return `It may say ${named}${more}, as you wrote them. Any other price is swapped out.`;
}
