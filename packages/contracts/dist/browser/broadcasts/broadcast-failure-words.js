import { CONSENT_CHANNELS } from "../consent/consent-channels.js";
export const BROADCAST_FAILURES = [
  "paused",
  "template_not_approved",
  "wire_unavailable",
  "run_interrupted",
  "throttled",
  "stalled",
  "people_unreadable",
  "after_hours",
  "provider_limit",
  "campaigns_domain_unverified",
  "email_offers_paused"
];
const WIRE_FAILURES = ["wire_unavailable", "throttled", "stalled"];
const isFailure = (code) => BROADCAST_FAILURES.includes(code);
const isWireFailure = (code) => WIRE_FAILURES.includes(code);
export function readFailure(stored) {
  const [code, named, ...rest] = stored.split(":");
  if (code === void 0 || !isFailure(code) || rest.length > 0) return null;
  if (named === void 0) return { code, channel: "whatsapp" };
  const channel = CONSENT_CHANNELS.find((c) => c === named);
  return channel && isWireFailure(code) ? { code, channel } : null;
}
export const wordsFor = (w, channel) => typeof w === "string" ? w : w[channel];
export const BROADCAST_FAILURE_WORDS = {
  paused: "the workspace was paused",
  template_not_approved: "its WhatsApp version is no longer approved",
  wire_unavailable: {
    whatsapp: "WhatsApp could not be reached",
    sms: "the texting provider could not be reached",
    email: "the mail provider could not be reached"
  },
  run_interrupted: "its send stopped partway and did not start again",
  throttled: {
    whatsapp: "WhatsApp kept limiting how fast this number may send",
    sms: "the texting provider kept limiting how fast this line may send",
    email: "the mail provider kept limiting how fast this workspace may send"
  },
  stalled: {
    whatsapp: "its people or its number's credentials could not be read for half an hour",
    sms: "its line's credentials could not be read for half an hour",
    email: "its mailbox could not be read for half an hour"
  },
  people_unreadable: "its people could not be read for half an hour",
  after_hours: "the day's sending hours ran out before it was done",
  provider_limit: "the mail provider's limit for the day or the month was reached",
  campaigns_domain_unverified: "the domain offers by email leave from is not verified with the mail provider",
  email_offers_paused: "the workspace's offers by email were paused while complaints and bounces settled"
};
export function broadcastFailureWords(failure) {
  if (!failure) return "no reason was recorded";
  const read = readFailure(failure);
  return read ? wordsFor(BROADCAST_FAILURE_WORDS[read.code], read.channel) : "it could not finish";
}
