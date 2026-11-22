import "server-only";
import type { ConversationDto, MessageDto, Touch } from "@chanlytics/contracts";
import { adRefIn, readAdTouches } from "@chanlytics/db/ads";
import { logAndGoOn } from "@chanlytics/log";
import type { ReaderContext } from "../shared/reader";

/**
 * Where an ad comes into a conversation (the Ads tracking plan's T1): the ad its person first came from, under the
 * thread's head, as their page names it (contacts.acquired_via, ad_named), and each message that came from an ad,
 * marked where it happened, so a known person who writes again from an ad months later is seen there too. Read for
 * every thread of an answer at once through the shared record's reader over ad_entries (db ads/touches.ts), by this
 * workspace and these messages.
 *
 * Only a person who first came from an ad and a customer's message an ad's referral rode in on are asked about, so an
 * answer whose threads hold no ad costs no read. A read that fails costs the threads nothing: they carry no ad, which
 * claims none.
 */

/** A thread's person as its row was read: how they first came, and what named it (CONVERSATION_COLUMNS). */
interface FirstCame {
  acquired_via?: string | null;
  acquired_ref?: string | null;
}

/** An ad as the wire names it, on a thread and on a message. */
type WireAd = NonNullable<MessageDto["from_ad"]>;

/** A touch's ad as the wire names it. */
const namedOnWire = (subject: Touch["subject"]): WireAd => ({ ad_id: subject.id, name: subject.name });

/** A customer's messages that an ad's referral rode in on: the ones an entry may hold. */
const fromAnAd = (message: MessageDto): boolean =>
  adRefIn({ fromCustomer: message.direction === "inbound" && message.sender === "customer", meta: message.meta }) !==
  null;

type Rc = Pick<ReaderContext, "ctx" | "tenantId">;

/** The ads these messages and first touches name, read once; null where nothing needs reading, or the read failed. */
async function readTouches(
  rc: Rc,
  messages: readonly MessageDto[],
  refs: readonly string[],
): Promise<{ marks: Map<string, WireAd>; firsts: Map<string, WireAd> } | null> {
  const messageIds = messages.filter(fromAnAd).map((message) => message.id);
  if (messageIds.length === 0 && refs.length === 0) return null;
  const read = await readAdTouches(rc.ctx.supabase, rc.tenantId, { messageIds, refs }).catch(
    logAndGoOn("the ads in the conversations", null),
  );
  if (!read) return null;
  return {
    marks: new Map(read.touches.map((touch) => [touch.message_id, namedOnWire(touch.subject)])),
    firsts: new Map([...read.firsts].map(([ref, subject]) => [ref, namedOnWire(subject)])),
  };
}

/** Each message that came from an ad, marked with it; the list itself where none did. */
function markedMessages(messages: MessageDto[], marks: ReadonlyMap<string, WireAd>): MessageDto[] {
  if (!messages.some((message) => marks.has(message.id))) return messages;
  return messages.map((message) => {
    const mark = marks.get(message.id);
    return mark ? { ...message, from_ad: mark } : message;
  });
}

/**
 * The ads in these threads, read once: each DTO with `from_ad` where its person first came from an ad Chanlytics could
 * read, and each of its messages that came from one marked. `firstOf` holds how each thread's person first came, by the
 * thread's id; a thread it does not hold is asked nothing of its person.
 */
export async function withAds(
  rc: Rc,
  dtos: readonly ConversationDto[],
  firstOf: ReadonlyMap<string, FirstCame | null>,
): Promise<ConversationDto[]> {
  const refOf = (dto: ConversationDto): string | null => {
    const first = firstOf.get(dto.id);
    return first?.acquired_via === "ad" && first.acquired_ref ? first.acquired_ref : null;
  };
  const read = await readTouches(
    rc,
    dtos.flatMap((dto) => dto.messages),
    dtos.flatMap((dto) => refOf(dto) ?? []),
  );
  if (!read) return [...dtos];
  return dtos.map((dto) => {
    const ref = refOf(dto);
    const first = ref === null ? undefined : read.firsts.get(ref);
    return { ...dto, ...(first ? { from_ad: first } : {}), messages: markedMessages(dto.messages, read.marks) };
  });
}

/** A thread's own read of its messages (GET conversations/:id), each that came from an ad marked as the Inbox marks it. */
export async function markAdMessages(rc: Rc, messages: MessageDto[]): Promise<MessageDto[]> {
  const read = await readTouches(rc, messages, []);
  return read ? markedMessages(messages, read.marks) : messages;
}
