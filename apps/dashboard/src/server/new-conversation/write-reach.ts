/**
 * What the reach read answers of one person (GET people/[id]/reach): who they are, their thread, each wire as the one
 * rule says it stands (write-ways.ts writeWaysOf), the call, and what fills an approved message's slots. Its own module,
 * apart from the rule, so a page that asks only the rule (a person's page, drawing More's sends) carries none of the
 * sheet's words with it.
 */
import type { ChannelsReady, PersonRowDto, PersonReachDto } from "@chanlytics/contracts";
import {
  personName,
  firstNameOf,
  NEW_CONVERSATION_WORDS,
  defaultWriteWire,
  writeWaysOf,
  type WriteRow,
} from "@chanlytics/contracts";

/**
 * What the reach read answers of one person, composed from People's row for them: who they are, their thread as the
 * Inbox addresses it, each wire as it stands, the wire the sheet opens on, the call, whether the receptionist answers
 * them, and what fills an approved message's slots. `mode` is the receptionist's mode in force for them (their own
 * setting, else the workspace's; null where neither says): it answers unless told to ask first or never. `facts` are the
 * workspace's own words for the slots that name it, as the send reads them; null with none. `firstTextLine` is the line
 * a first text to them would carry, where no text of ours has reached them yet. `emailSigned` is the signature an email
 * from the member reading would carry (decision 0081); null where none would.
 */
export function writeReachOf(
  write: WriteRow & Pick<PersonRowDto, "id" | "display_name" | "wa_profile_name" | "name_source" | "name_settled_at">,
  at: {
    ready: ChannelsReady;
    mode: string | null;
    facts: { business_name: string; booking_link: string | null } | null;
    firstTextLine: string | null;
    emailSigned: string | null;
    now?: Date;
  },
): PersonReachDto {
  const { ready, mode, facts, now = new Date() } = at;
  const ways = writeWaysOf(write, ready, now);
  const call = NEW_CONVERSATION_WORDS.call;
  return {
    person: { id: write.id, name: personName(write), phone: write.phone_e164, email: write.email },
    thread: write.latest_conversation_id ? `th-${write.latest_conversation_id}` : null,
    ways,
    default_wire: defaultWriteWire(ways, write.last_inbound_channel),
    call: !write.phone_e164
      ? { ok: false, tel: null, why: call.noNumber }
      : write.dnc
        ? { ok: false, tel: null, why: call.doNotContact }
        : { ok: true, tel: write.phone_e164, why: null },
    receptionist: { answers: mode !== "ask" && mode !== "never" },
    offers_ok: write.marketing_consent === "opted_in",
    fills: facts
      ? {
          first_name: firstNameOf(write.display_name, write.wa_profile_name, {
            source: write.name_source,
            settled: !!write.name_settled_at,
          }),
          ...facts,
        }
      : null,
    first_text_line: ways.some((w) => w.wire === "sms" && w.ok) ? at.firstTextLine : null,
    email_signed: ways.some((w) => w.wire === "email" && w.ok) ? at.emailSigned : null,
  };
}
