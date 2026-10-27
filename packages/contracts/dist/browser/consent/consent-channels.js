export const CONSENT_CHANNELS = ["whatsapp", "sms", "email"];
export const CONSENT_CHANNEL_WORDS = {
  whatsapp: "on WhatsApp",
  sms: "by text",
  email: "by email"
};
function isConsentChannel(c) {
  return !!c && CONSENT_CHANNELS.includes(c);
}
export function channelsOfYes(purpose, source, channel) {
  if (source === "customer_message" && channel === "instagram") return [];
  if (purpose === "marketing" && source === "customer_message" && (channel === "sms" || channel === "email"))
    return ["whatsapp", channel];
  if (source === "customer_message" && isConsentChannel(channel)) return [channel];
  if (purpose === "marketing") return source === "form" || source === "customer_message" ? ["whatsapp"] : [];
  if (source === "form" || source === "phone") return ["whatsapp", "sms"];
  return ["whatsapp"];
}
export function yesCovers(channels, channel) {
  return channels == null ? channel === "whatsapp" : channels.includes(channel);
}
export function coveredChannels(channels) {
  return channels == null ? ["whatsapp"] : CONSENT_CHANNELS.filter((c) => channels.includes(c));
}
export function countsByChannelWords(by) {
  if (!by) return null;
  const went = CONSENT_CHANNELS.filter((c) => (by[c] ?? 0) > 0);
  return went.length > 1 ? went.map((c) => `${by[c]} ${CONSENT_CHANNEL_WORDS[c]}`).join(", ") : null;
}
export function channelsWords(channels) {
  const words = channels.map((c) => CONSENT_CHANNEL_WORDS[c]);
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
