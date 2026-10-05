/**
 * Which wire a thread's words travelled, and who answers on it: the channel of a message and of a thread, and
 * that channel in the words a row shows. The Inbox (inbox-thread.ts) and Conversations (conversation-vm.ts)
 * both read it here.
 */
import { isPersonsWords } from "./message-author";
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

/** A message as the channel rules read it: its kind and wire, and who wrote it where the reader holds that. */
type ChannelRow = Pick<MessageDto, "type" | "channel"> & Partial<Pick<MessageDto, "direction" | "sender" | "meta">>;

/**
 * Where a person last WROTE: the wire of their newest own words, or null when they have written none. Their own words
 * are a message they sent (not a call's note, which is an inbound row the system wrote) that a person wrote (not an
 * out-of-office or a list's mail from their address: isPersonsWords). THE one statement of it in TypeScript: a reply
 * goes out there (the dashboard's replyChannelOf asks the same of the database), and a thread's row names it
 * (threadChannelOf). Where it was derived from "the newest inbound row" a call's note read as WhatsApp and an
 * automatic reply made email "where they last wrote"; where it was "the newest message either way" a playbook's email
 * turned a WhatsApp customer's row into Email.
 */
export function lastWroteOn(messages: ReadonlyArray<ChannelRow>): "whatsapp" | "sms" | "email" | null {
  const theirs = [...messages]
    .reverse()
    .find(
      (m) =>
        m.direction === "inbound" && m.sender === "customer" && m.type !== "call_summary" && isPersonsWords(m.meta),
    );
  return theirs ? writtenChannelOf(theirs.channel) : null;
}

/**
 * The wire a thread is on: where the person last wrote (lastWroteOn), and for a thread they have never written on, the
 * wire our own written words last travelled; "phone" when it has none.
 *
 * One derivation, because three surfaces were each answering it their own way
 * and two of them answered "WhatsApp" whatever the row said. Today hard-coded
 * the word onto every escalation, so an email arriving read "WhatsApp \u00b7 waited
 * 12m"; the conversation row derived it properly only after the same defect
 * was found there. A row that names the wrong wire is worse than one that
 * names none: the owner replies in the wrong place, or does not recognise the
 * thread they are being asked about.
 */
export function threadChannelOf(messages: ReadonlyArray<ChannelRow>): "whatsapp" | "sms" | "email" | "phone" {
  const wrote = lastWroteOn(messages);
  if (wrote) return wrote;
  const written = [...messages].reverse().find((m) => m.type !== "call_summary");
  return written ? writtenChannelOf(written.channel) : "phone";
}

/** The same question, in the words a row shows. */
export function threadChannelWords(messages: ReadonlyArray<ChannelRow>): "WhatsApp" | "Text" | "Email" | "Phone" {
  return THREAD_CHANNEL_WORDS[threadChannelOf(messages)];
}
