import { agoWords, DATE_FMT, DAY_MS } from "../shared/time.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { lineOffGets } from "./caller-gets.js";
const channelIsOn = (c) => typeof c.on === "boolean" ? c.on : (c.status ?? "active") === "active";
export function channelFor(rows, kind) {
  const mine = rows.filter((c) => c.kind === kind);
  if (mine.length === 0) return null;
  const on = mine.filter(channelIsOn);
  const pool = on.length > 0 ? on : mine;
  return [...pool].sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""))[0] ?? pool[0];
}
const QUIET_AFTER_MS = 7 * DAY_MS;
function ago(ms, nowMs) {
  return agoWords(ms, nowMs, { dateAfterMs: QUIET_AFTER_MS, date: (at) => DATE_FMT.format(new Date(at)) });
}
export const CHANNEL_KIND_WORDS = {
  whatsapp: "WhatsApp",
  voice: "Phone line",
  sms: "Texting",
  email: "Email",
  instagram: "Instagram"
};
export function channelKindWords(kind) {
  return CHANNEL_KIND_WORDS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}
export const CHANNEL_ANSWERED = /* @__PURE__ */ new Set(["whatsapp", "voice", "sms"]);
const KIND_META = {
  whatsapp: {
    name: `${CHANNEL_KIND_WORDS.whatsapp} Business`,
    what: "Customers text this number; the receptionist answers",
    icon: "chat",
    noun: "message"
  },
  voice: {
    name: CHANNEL_KIND_WORDS.voice,
    what: "Customers call this number; the receptionist picks up",
    icon: "phone",
    noun: "call"
  },
  sms: { name: CHANNEL_KIND_WORDS.sms, what: "Text messages", icon: "chat", noun: "message" },
  email: { name: CHANNEL_KIND_WORDS.email, what: "Email", icon: "mail", noun: "email" },
  instagram: { name: CHANNEL_KIND_WORDS.instagram, what: "Direct messages", icon: "instagram", noun: "message" }
};
export function channelNoun(kind) {
  return KIND_META[kind]?.noun ?? "message";
}
export function toChannelVM(dto, now = /* @__PURE__ */ new Date()) {
  const nowMs = now.getTime();
  const meta = KIND_META[dto.kind] ?? {
    name: channelKindWords(dto.kind),
    what: "",
    icon: "chat",
    noun: channelNoun(dto.kind)
  };
  const last = dto.last_inbound_at ? new Date(dto.last_inbound_at).getTime() : null;
  const on = dto.status === "active";
  let health;
  let healthLabel;
  if (!on) {
    health = "off";
    healthLabel = `Switched off \u2014 ${lineOffGets(dto.kind, meta.noun).gets}; Chanlytics is told${dto.kind === "voice" ? "" : " they are arriving"}, you are not`;
  } else if (last === null) {
    health = "unused";
    healthLabel = `On \u2014 no ${meta.noun} has arrived yet`;
  } else if (nowMs - last <= QUIET_AFTER_MS) {
    health = "receiving";
    healthLabel = `Receiving \xB7 last ${meta.noun} ${ago(last, nowMs)}`;
  } else {
    health = "quiet";
    healthLabel = `Quiet \xB7 last ${meta.noun} ${ago(last, nowMs)}`;
  }
  return {
    id: dto.id,
    kind: dto.kind,
    name: meta.name,
    what: meta.what,
    icon: meta.icon,
    number: formatPhoneDisplay(dto.number_e164),
    on,
    health,
    healthLabel,
    lastInboundMs: last,
    quality: dto.quality ?? null,
    qualityEvent: dto.quality_event ?? null,
    messagingLimit: dto.messaging_limit ?? null,
    standing: dto.standing ?? null,
    standingReadAt: dto.standing_read_at ?? null,
    connectedAt: dto.connected_at ?? null,
    created_at: dto.created_at
  };
}
