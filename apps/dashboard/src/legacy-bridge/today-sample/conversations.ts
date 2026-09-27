/**
 * The sample's threads: eight on the usual day and eight more on a busy one, each written with the same three
 * helpers (a contact, a message, a thread) over the sample's clock.
 */
import type { ConversationDto } from "@chanlytics/contracts";
import { phone, type SampleClock } from "./clock";

const contact = (id: string, name: string | null, last4: string, over: Partial<ConversationDto["contact"]> = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: phone(last4),
  consent: "opted_in",
  dnc: false,
  marketing_consent: null,
  ...over,
});
const msg = (id: string, dir: "in" | "ai" | "failed", body: string, created_at: string, channel = "whatsapp") => ({
  id,
  direction: dir === "in" ? ("inbound" as const) : ("outbound" as const),
  sender: dir === "in" ? ("customer" as const) : ("ai" as const),
  type: "text",
  body,
  media: null,
  meta: null,
  status: dir === "in" ? "received" : dir === "failed" ? "failed" : "delivered",
  channel,
  created_at,
});
const thread = (
  id: string,
  c: ConversationDto["contact"],
  messages: ConversationDto["messages"],
  over: Partial<ConversationDto> = {},
): ConversationDto => ({
  id,
  state: "open",
  paused_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: null,
  last_message_at: messages.at(-1)?.created_at ?? null,
  contact: c,
  messages,
  ...over,
});

/**
 * Eight threads: two people new today, one email, one text, one nobody answered, one handed over, one call-back,
 * one reply window closing, one reply that failed to deliver.
 */
function usualThreads({ ago, at }: SampleClock): ConversationDto[] {
  return [
    thread("cv-renata", contact("k-renata", "Renata Solís", "0101"), [
      msg("m-r1", "in", "Hi! Do you have anything for a gel manicure this Saturday?", ago(410)),
      msg(
        "m-r2",
        "ai",
        "Hi Renata! Saturday I have 10:00 and 2:00 open for a gel manicure. Which suits you?",
        ago(409),
      ),
    ]),
    thread("cv-marco", contact("k-marco", "Marco Ibáñez", "0102", { phone_e164: null, email: "marco@example.com" }), [
      msg("m-m1", "in", "Do you do men's cuts? Looking for something this week.", ago(300), "email"),
      msg(
        "m-m2",
        "ai",
        "We do. This week I have Thursday 5:30 PM and Friday 11:00 AM. Shall I hold one?",
        ago(298),
        "email",
      ),
    ]),
    thread("cv-dulce", contact("k-dulce", "Dulce Amaro", "0103"), [
      msg("m-d0", "in", "Booking for the 12th please", at(9, 0, -9), "sms"),
      msg("m-d1", "ai", "Done: the 12th at 3:00 PM.", at(9, 1, -9), "sms"),
      msg("m-d2", "in", "Can I bring my sister too?", ago(150), "sms"),
    ]),
    thread(
      "cv-ana",
      contact("k-ana", "Ana Reyes", "0104"),
      [
        msg("m-a0", "in", "Hi, can I book a color treatment?", at(10, 0, -8)),
        msg("m-a1", "ai", "Of course. Friday 10:30 AM is open.", at(10, 1, -8)),
        msg("m-a2", "in", "I'd rather talk to a person about a refund for last time.", ago(95)),
      ],
      { state: "needs_human", last_wa_inbound_at: ago(95) },
    ),
    thread("cv-kenia", contact("k-kenia", "Kenia Duarte", "0105"), [], { state: "needs_human" }),
    thread(
      "cv-priya",
      contact("k-priya", "Priya Nair", "0106"),
      [
        msg("m-p0", "in", "Do you do color treatments?", at(10, 0, -12)),
        msg("m-p0r", "ai", "We do. I can check this week's times if you'd like.", at(10, 1, -12)),
        msg("m-p1", "in", "Do you do color treatments on Sundays?", ago(130)),
        msg("m-p2", "failed", "We're closed Sundays, but Saturday 1:00 PM is open if that works.", ago(129)),
      ],
      { last_wa_inbound_at: ago(130) },
    ),
    thread(
      "cv-bea",
      contact("k-bea", "Bea Lind", "0107"),
      [
        msg("m-b0", "in", "Do you have anything this week for a gloss?", at(9, 0, -20)),
        msg("m-b0r", "ai", "Thursday 9:00 works. See you then.", at(9, 1, -20)),
        msg("m-b1", "in", "Thanks, see you tomorrow!", ago(20)),
        msg("m-b2", "ai", "See you tomorrow at 9:00, Bea.", ago(19)),
      ],
      { last_wa_inbound_at: ago(20) },
    ),
    thread(
      "cv-sofia",
      contact("k-sofia", "Sofía Mendes", "0108"),
      [msg("m-s1", "in", "Can you hold the 3 PM for me? I'll confirm tonight.", ago(21 * 60))],
      { last_wa_inbound_at: ago(21 * 60) },
    ),
  ];
}

/**
 * A busy day: eight more threads that ask for a person, a call back or a reply before a window closes, all older
 * than today so the "new people" figure is untouched. With these the queue holds twelve and draws six.
 */
function busyThreads({ ago, at }: SampleClock): ConversationDto[] {
  return [
    thread(
      "cv-lucia",
      contact("k-lucia", "Lucía Ferreira", "0111"),
      [
        msg("m-l0", "in", "Is the 2 PM still open tomorrow?", at(9, 0, -3)),
        msg("m-l1", "ai", "It is. Shall I hold it?", at(9, 1, -3)),
        msg("m-l2", "in", "I need to speak to someone about my deposit.", ago(160)),
      ],
      { state: "needs_human", last_wa_inbound_at: ago(160) },
    ),
    thread(
      "cv-noor",
      contact("k-noor", "Noor Haddad", "0112"),
      [
        msg("m-n0", "in", "Do you do cuts for kids?", at(11, 0, -4)),
        msg("m-n1", "ai", "We do, from age five. Want a time?", at(11, 1, -4)),
        msg("m-n2", "in", "Can a person call me? It's about an allergy.", ago(75)),
      ],
      { state: "needs_human", last_wa_inbound_at: ago(75) },
    ),
    thread(
      "cv-iris",
      contact("k-iris", "Iris Kowalski", "0113"),
      [
        msg("m-i0", "in", "How much is a gloss?", at(10, 0, -5)),
        msg("m-i1", "ai", "From 60, depending on length.", at(10, 1, -5)),
        msg("m-i2", "in", "I sent a photo of what I want, did you get it?", ago(55)),
      ],
      { state: "needs_human", last_wa_inbound_at: ago(55) },
    ),
    thread(
      "cv-camila",
      contact("k-camila", "Camila Duarte", "0114"),
      [
        msg("m-c0", "in", "Booking for two on Friday?", at(9, 30, -6)),
        msg("m-c1", "ai", "Friday 3:00 and 3:15 are open side by side.", at(9, 31, -6)),
        msg("m-c2", "in", "My friend wants a refund for last time first.", ago(35)),
      ],
      { state: "needs_human", last_wa_inbound_at: ago(35) },
    ),
    thread(
      "cv-zoe",
      contact("k-zoe", "Zoe Martin", "0115"),
      [
        msg("m-z0", "in", "Any openings Thursday evening?", at(12, 0, -2)),
        msg("m-z1", "ai", "Thursday 5:30 PM is open.", at(12, 1, -2)),
        msg("m-z2", "in", "Hold it, I'll confirm by tonight.", ago(22 * 60 + 30)),
      ],
      { last_wa_inbound_at: ago(22 * 60 + 30) },
    ),
    thread(
      "cv-emily",
      contact("k-emily", "Emily Chen", "0116"),
      [
        msg("m-e0", "in", "Do you have a cut and gloss together?", at(13, 0, -7)),
        msg("m-e1", "ai", "We do. It takes about two hours.", at(13, 1, -7)),
        msg("m-e2", "in", "Saturday morning if you can.", ago(23 * 60)),
      ],
      { last_wa_inbound_at: ago(23 * 60) },
    ),
    thread(
      "cv-omar",
      contact("k-omar", "Omar Haddad", "0117"),
      [
        msg("m-o0", "in", "Is there parking?", at(15, 0, -9)),
        msg("m-o1", "ai", "Yes, behind the building.", at(15, 1, -9)),
        msg("m-o2", "in", "Thanks, see you at 12.", ago(200)),
        msg("m-o3", "ai", "See you at 12, Omar.", ago(199)),
      ],
      { last_wa_inbound_at: ago(200) },
    ),
    thread(
      "cv-alejandra",
      contact("k-alejandra", "Alejandra Peña", "0118"),
      [
        msg("m-x0", "in", "Color consultation this week?", at(10, 0, -11)),
        msg("m-x1", "ai", "Wednesday 10:00 is open.", at(10, 1, -11)),
        msg("m-x2", "in", "Booked, thank you!", ago(240)),
        msg("m-x3", "ai", "See you Wednesday.", ago(239)),
      ],
      { last_wa_inbound_at: ago(240) },
    ),
  ];
}

/** The day's threads: the usual eight, and on a busy day the eight more after them. */
export function sampleConversations(clock: SampleClock, busy: boolean): ConversationDto[] {
  const conversations = usualThreads(clock);
  if (busy) conversations.push(...busyThreads(clock));
  return conversations;
}
