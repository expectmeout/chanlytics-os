import { personName } from "../people/person-name.js";
import { firstNameOf } from "../templates/templates.js";
import { NEW_CONVERSATION_WORDS } from "./new-conversation-words.js";
import { defaultWriteWire, writeWaysOf } from "./write-ways.js";
export function writeReachOf(r, at) {
  const { ready, mode, facts, now = /* @__PURE__ */ new Date() } = at;
  const ways = writeWaysOf(r, ready, now);
  const C = NEW_CONVERSATION_WORDS.call;
  return {
    person: { id: r.id, name: personName(r), phone: r.phone_e164, email: r.email },
    thread: r.latest_conversation_id ? `th-${r.latest_conversation_id}` : null,
    ways,
    default_wire: defaultWriteWire(ways, r.last_inbound_channel),
    call: !r.phone_e164 ? { ok: false, tel: null, why: C.noNumber } : r.dnc ? { ok: false, tel: null, why: C.doNotContact } : { ok: true, tel: r.phone_e164, why: null },
    receptionist: { answers: mode !== "ask" && mode !== "never" },
    offers_ok: r.marketing_consent === "opted_in",
    fills: facts ? {
      first_name: firstNameOf(r.display_name, r.wa_profile_name, {
        source: r.name_source,
        settled: !!r.name_settled_at
      }),
      ...facts
    } : null,
    first_text_line: ways.some((w) => w.wire === "sms" && w.ok) ? at.firstTextLine : null
  };
}
