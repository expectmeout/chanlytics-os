import { isPersonsWords } from "./message-author.js";
const AGENTS = {
  whatsapp: { glyph: "W", name: "WhatsApp Receptionist" },
  sms: { glyph: "T", name: "Text Receptionist" },
  email: { glyph: "Y", name: "Your team" },
  instagram: { glyph: "I", name: "Instagram Receptionist" },
  phone: { glyph: "P", name: "Phone Receptionist" }
};
export function agentFor(channel) {
  return AGENTS[channel] ?? AGENTS.whatsapp;
}
export function writtenChannelOf(channel) {
  return channel === "sms" || channel === "email" || channel === "instagram" ? channel : "whatsapp";
}
export const THREAD_CHANNEL_WORDS = {
  whatsapp: "WhatsApp",
  phone: "Phone",
  sms: "Text",
  email: "Email",
  instagram: "Instagram"
};
export function lastWroteOn(messages) {
  const theirs = [...messages].reverse().find(isTheirOwnWords);
  return theirs ? writtenChannelOf(theirs.channel) : null;
}
export function isChatMessage(m) {
  return m.type !== "call_summary" && m.type !== "note";
}
export function isFromTheirSide(m) {
  return m.sender === "customer" && m.direction !== "outbound" && isChatMessage(m);
}
export function isTheirOwnWords(m) {
  return isFromTheirSide(m) && isPersonsWords(m.meta);
}
export function threadChannelOf(messages) {
  const reply = replyWireOf(messages);
  if (reply) return reply;
  const ours = [...messages].reverse().find((m) => m.type !== "call_summary");
  return ours ? writtenChannelOf(ours.channel) : "phone";
}
function replyWireOf(messages) {
  const wrote = lastWroteOn(messages);
  if (wrote) return wrote;
  const theirs = [...messages].reverse().find(isFromTheirSide);
  return theirs ? writtenChannelOf(theirs.channel) : null;
}
export function answerWireOf(messages) {
  const theirs = replyWireOf(messages);
  if (theirs) return theirs;
  const ours = [...messages].reverse().find((m) => isChatMessage(m) && m.direction === "outbound");
  return writtenChannelOf(ours?.channel);
}
export function threadChannelWords(messages) {
  return THREAD_CHANNEL_WORDS[threadChannelOf(messages)];
}
