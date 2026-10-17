import { ESCALATION_REASON_SHORT, HOLD_ACT_WORDS, holdActOf, reasonShort } from "../conversations/escalations.js";
import { formatPhoneDisplay } from "../shared/phone.js";
const HOLD_CHANNEL_WORDS = {
  whatsapp: "WhatsApp",
  sms: "Text",
  email: "Email",
  voice: "Phone"
};
const clipped = (s, max) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}\u2026` : t;
};
export function holdNotice(f) {
  const why = Object.hasOwn(ESCALATION_REASON_SHORT, f.reason) ? reasonShort(f.reason) : null;
  const act = HOLD_ACT_WORDS[holdActOf(f.reason)].notice;
  const where = HOLD_CHANNEL_WORDS[f.channel ?? ""] ?? "The";
  const shown = f.erased ? null : f.address?.startsWith("+") ? formatPhoneDisplay(f.address) ?? f.address : f.address;
  const name = !f.erased && f.who?.trim() || shown || "A customer";
  const lines = f.erased ? [] : [
    ...f.customerWords ? [`They wrote: \u201C${clipped(f.customerWords, 600)}\u201D`] : [],
    ...f.replyWords ? [`The receptionist: \u201C${clipped(f.replyWords, 600)}\u201D`] : [],
    ...f.details ? [clipped(f.details, 600)] : []
  ];
  const pause = f.pausedHours ? `${act.replace(/\.$/, "")} \u2014 the receptionist is paused on this thread for ${f.pausedHours}h.` : act;
  return {
    kind: "handoff",
    route: `inbox/th-${f.conversationId}`,
    about: { type: "conversation", id: f.conversationId },
    subject: clipped(why ? `${name} needs a person \u2014 ${why}` : `${name} needs a person`, 200),
    body: [...lines, "", `${where} conversation${shown ? ` \xB7 ${shown}` : ""}`, pause].join("\n").replace(/^\n/, ""),
    redactedBody: `A ${where === "The" ? "" : `${where} `}conversation needed a person${why ? ` (${why})` : ""}, and nobody could be told.`
  };
}
