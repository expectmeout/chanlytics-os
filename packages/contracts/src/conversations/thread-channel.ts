/**
 * Which wire a thread's words travelled, and who answers on it: the channel of a message and of a thread, and
 * that channel in the words a row shows. The Inbox (inbox-thread.ts) and Conversations (conversation-vm.ts)
 * both read it here.
 */
import type { MessageDto } from "./thread-dto";

/**
 * Who answers a thread on each wire, as the chip under a row names it.
 *
 * It was one constant, "WhatsApp Receptionist", on every row and every thread
 * whatever wire it was on -- so an email thread credited a receptionist that
 * does not answer email at all. On email it is the team, in the words the
 * thread already signs a person's reply with ("by your team"). On the phone
 * the call view models name their own.
 */
const AGENTS = {
  whatsapp: { glyph: "W", name: "WhatsApp Receptionist" },
  sms: { glyph: "T", name: "Text Receptionist" },
  email: { glyph: "Y", name: "Your team" },
  phone: { glyph: "P", name: "Phone Receptionist" },
} as const;
export function agentFor(channel: "whatsapp" | "sms" | "email" | "phone"): { glyph: string; name: string } {
  return AGENTS[channel] ?? AGENTS.whatsapp;
}

/** The wire a written message travelled, as a thread names it. Anything unnamed is WhatsApp, which is what every row was before the column said. */
export function writtenChannelOf(channel: string | null | undefined): "whatsapp" | "sms" | "email" {
  return channel === "sms" ? "sms" : channel === "email" ? "email" : "whatsapp";
}

/** A thread's channel in the words under a person's name. */
export const THREAD_CHANNEL_WORDS = { whatsapp: "WhatsApp", phone: "Phone", sms: "Text", email: "Email" } as const;

/**
 * The wire a thread's written words LAST travelled; "phone" when it has none.
 *
 * One derivation, because three surfaces were each answering it their own way
 * and two of them answered "WhatsApp" whatever the row said. Today hard-coded
 * the word onto every escalation, so an email arriving read "WhatsApp \u00b7 waited
 * 12m"; the conversation row derived it properly only after the same defect
 * was found there. A row that names the wrong wire is worse than one that
 * names none: the owner replies in the wrong place, or does not recognise the
 * thread they are being asked about.
 */
export function threadChannelOf(
  messages: ReadonlyArray<Pick<MessageDto, "type" | "channel">>,
): "whatsapp" | "sms" | "email" | "phone" {
  const written = [...messages].reverse().find((m) => m.type !== "call_summary");
  return written ? writtenChannelOf(written.channel) : "phone";
}

/** The same question, in the words a row shows. */
export function threadChannelWords(
  messages: ReadonlyArray<Pick<MessageDto, "type" | "channel">>,
): "WhatsApp" | "Text" | "Email" | "Phone" {
  return THREAD_CHANNEL_WORDS[threadChannelOf(messages)];
}
