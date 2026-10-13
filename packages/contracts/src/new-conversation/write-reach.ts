/**
 * What the reach read answers of one person (GET people/[id]/reach): who they are, their thread, each wire as the one
 * rule says it stands (write-ways.ts writeWaysOf), the call, and what fills an approved message's slots. Its own module,
 * apart from the rule, so a page that asks only the rule (a person's page, drawing More's sends) carries none of the
 * sheet's words with it.
 */
import type { ChannelsReady } from "../broadcasts/reach-for";
import type { PersonRowDto } from "../people/person-dto";
import { personName } from "../people/person-name";
import { firstNameOf } from "../templates/templates";
import { NEW_CONVERSATION_WORDS } from "./new-conversation-words";
import type { PersonReachDto } from "./person-draft";
import { defaultWriteWire, writeWaysOf, type WriteRow } from "./write-ways";

/**
 * What the reach read answers of one person, composed from People's row for them: who they are, their thread as the
 * Inbox addresses it, each wire as it stands, the wire the sheet opens on, the call, whether the receptionist answers
 * them, and what fills an approved message's slots. `mode` is the receptionist's mode in force for them (their own
 * setting, else the workspace's; null where neither says): it answers unless told to ask first or never. `facts` are the
 * workspace's own words for the slots that name it, as the send reads them; null with none. `firstTextLine` is the line
 * a first text to them would carry, where no text of ours has reached them yet.
 */
export function writeReachOf(
  r: WriteRow & Pick<PersonRowDto, "id" | "display_name" | "wa_profile_name" | "name_source" | "name_settled_at">,
  at: {
    ready: ChannelsReady;
    mode: string | null;
    facts: { business_name: string; booking_link: string | null } | null;
    firstTextLine: string | null;
    now?: Date;
  },
): PersonReachDto {
  const { ready, mode, facts, now = new Date() } = at;
  const ways = writeWaysOf(r, ready, now);
  const C = NEW_CONVERSATION_WORDS.call;
  return {
    person: { id: r.id, name: personName(r), phone: r.phone_e164, email: r.email },
    thread: r.latest_conversation_id ? `th-${r.latest_conversation_id}` : null,
    ways,
    default_wire: defaultWriteWire(ways, r.last_inbound_channel),
    call: !r.phone_e164
      ? { ok: false, tel: null, why: C.noNumber }
      : r.dnc
        ? { ok: false, tel: null, why: C.doNotContact }
        : { ok: true, tel: r.phone_e164, why: null },
    receptionist: { answers: mode !== "ask" && mode !== "never" },
    offers_ok: r.marketing_consent === "opted_in",
    fills: facts
      ? {
          first_name: firstNameOf(r.display_name, r.wa_profile_name, {
            source: r.name_source,
            settled: !!r.name_settled_at,
          }),
          ...facts,
        }
      : null,
    first_text_line: ways.some((w) => w.wire === "sms" && w.ok) ? at.firstTextLine : null,
  };
}
