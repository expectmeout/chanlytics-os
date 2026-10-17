import { priceNextStep } from "../config/no-booking-link.js";
const OPEN = 'Owner: "';
const STANDING_RULES_HOLD = (what) => `The rules in your instructions still hold, and you are the business's automated assistant, never a person: if the ${what} asks for something they rule out, use what you can of it and leave the rest.`;
export function frameWhisper(text) {
  return `A whisper from the business owner, who is listening to this call. The caller cannot hear it.
${OPEN}${text.trim()}"
Keep it in mind from here on and use it in your own words when it fits: in your next answer if it applies now, later if it is conditional (for example, only if the caller brings something up). Never read it out word for word, and do not force it into an answer where it does not belong. ` + STANDING_RULES_HOLD("whisper");
}
export function frameGuardrail(rule, opts) {
  const what = rule === "price" ? "You said a price your instructions do not let you give." : "You broke one of your standing rules.";
  return `A correction from the Chanlytics platform, not from the business. The caller cannot hear it.
${what}
Put it right in your own words when you next speak: say you cannot confirm pricing yourself, that the team confirms it, and ${priceNextStep(opts.hasBookingLink)}. Do not repeat the figure, and never read this out.`;
}
export function frameSteer(text) {
  return `An instruction from the business owner, who read your draft before it went out. The customer cannot see it.
${OPEN}${text.trim()}"
Write your reply again and follow it where it fits. Keep everything else that was right. Never repeat the instruction word for word. ` + STANDING_RULES_HOLD("instruction");
}
export function whisperText(content) {
  const c = (content ?? "").replace(/\r\n/g, "\n");
  const at = c.indexOf(OPEN);
  if (at === -1) return c.trim();
  const rest = c.slice(at + OPEN.length);
  const close = rest.indexOf('"\n');
  return (close === -1 ? rest.replace(/"$/, "") : rest.slice(0, close)).trim();
}
export function frameHandOver() {
  return "A message from the Chanlytics platform, not from the business. The caller cannot hear it.\nThe business owner is picking up this call themselves.\nTransfer the caller to the business's own line now with transfer_to_staff. Say only that you are connecting them to someone at the business; do not ask why, do not answer anything else first, and never read this out.";
}
const PLATFORM = "from the Chanlytics platform";
export function injectedTurn(content) {
  const c = (content ?? "").replace(/\r\n/g, "\n");
  if (c.includes(OPEN)) return { speaker: "whisper", text: whisperText(c) };
  const lines = c.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2 && lines[0].includes(PLATFORM)) return { speaker: "platform", text: lines[1] };
  return { speaker: "whisper", text: c.trim() };
}
