/**
 * One thread as the phone app's native screen draws it (the PRD, PR 8): every sentence on that screen comes from
 * here, over the same view model the web's Conversations page uses (toConversationVM), so the two never disagree
 * about who said what, when, and what became of it. Pure; the app renders, it does not decide.
 */
import { formatPhoneDisplay } from "./phone";
import { replyWindow } from "./policy";
import {
  threadChannelOf,
  threadChannelWords,
  toConversationVM,
  type ConversationDto,
  type ConversationMessageVM,
} from "./viewmodels";

export interface NativeThreadVM {
  id: string;
  /** Who the thread is with, as every surface names them. */
  title: string;
  /** The wire and the number or address under the name: "WhatsApp · +1 (305) 555-0100". */
  subtitle: string;
  /** Oldest first, as the page holds them. */
  bubbles: ConversationMessageVM[];
  /** Whether a reply typed here may go, and the sentence that says why not. */
  composer: { kind: "text"; placeholder: string } | { kind: "closed"; words: string };
  /** The oldest message's own instant, for paging back; null when there are none. */
  oldestAt: string | null;
}

/** Why a reply cannot be typed on the phone, in one sentence each. */
export const NATIVE_THREAD_WORDS = {
  optedOut: "This person asked not to be messaged.",
  windowClosed: "The WhatsApp window has closed. Send an approved template from the web to reopen it.",
  archived: "This conversation is archived. Reopen it from the web to reply.",
} as const;

export function nativeThreadVM(dto: ConversationDto, tz: string, now = new Date()): NativeThreadVM {
  const vm = toConversationVM(dto, tz, now);
  const channel = threadChannelOf(dto.messages);
  const where =
    channel === "email"
      ? (dto.contact.email ?? "").trim()
      : formatPhoneDisplay(dto.contact.phone_e164) || (dto.contact.phone_e164 ?? "").trim();
  const subtitle = [threadChannelWords(dto.messages), where].filter(Boolean).join(" · ");
  const composer = composerOf(dto, channel, now);
  const first = dto.messages[0];
  return {
    id: dto.id,
    title: vm.who,
    subtitle,
    bubbles: vm.messages,
    composer,
    oldestAt: first ? first.created_at : null,
  };
}

function composerOf(
  dto: ConversationDto,
  channel: "whatsapp" | "sms" | "email" | "phone",
  now: Date,
): NativeThreadVM["composer"] {
  if (dto.contact.dnc || dto.contact.consent === "opted_out")
    return { kind: "closed", words: NATIVE_THREAD_WORDS.optedOut };
  if (dto.state === "archived") return { kind: "closed", words: NATIVE_THREAD_WORDS.archived };
  // The written wire the reply goes out on: a thread of calls alone answers on WhatsApp, as the web's composer does.
  const wire = channel === "phone" ? "whatsapp" : channel;
  const window = replyWindow(wire, dto.last_wa_inbound_at, now);
  if (!window.open) return { kind: "closed", words: NATIVE_THREAD_WORDS.windowClosed };
  return { kind: "text", placeholder: wire === "email" ? "Write an email…" : "Write a message…" };
}
