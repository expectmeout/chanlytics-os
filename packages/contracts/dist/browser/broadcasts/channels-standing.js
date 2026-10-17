import { CONSENT_CHANNELS, CONSENT_CHANNEL_WORDS } from "../consent/consent-channels.js";
import { VERSION_CHANNEL_WORDS } from "../templates/message-versions.js";
import { joinWords } from "../shared/words.js";
import { WORKSPACE_PAUSED_FACT } from "../workspace/billing.js";
import { CHANNEL_WORDS } from "./reach-for.js";
export const CHANNELS_DOOR = "admin/integrations";
const BILLING_DOOR = "admin/billing";
const NO_DOOR = [
  CHANNEL_WORDS.unchecked,
  CHANNEL_WORDS.noEmailDomain,
  CHANNEL_WORDS.textLineNotActive,
  CHANNEL_WORDS.textLineMock
];
function closedWords(channel, why) {
  const reason = (why ?? "").replace(/\.$/, "");
  return reason ? `${VERSION_CHANNEL_WORDS[channel]}: ${reason}` : `${VERSION_CHANNEL_WORDS[channel]} is off`;
}
export function channelsStandingParts(ready) {
  if (!ready) return null;
  if (ready.paused === true)
    return [{ channel: null, channels: [], open: false, words: WORKSPACE_PAUSED_FACT, door: BILLING_DOOR }];
  const open = CONSENT_CHANNELS.filter((c) => ready[c].ready);
  const closed = CONSENT_CHANNELS.filter((c) => !ready[c].ready);
  const parts = [
    {
      channel: null,
      channels: open,
      open: true,
      words: open.length > 0 ? `Sending ${joinWords(open.map((c) => CONSENT_CHANNEL_WORDS[c]))}` : "Nothing can send yet",
      door: null
    }
  ];
  for (const c of closed) {
    const why = ready[c].why;
    parts.push({
      channel: c,
      channels: [c],
      open: false,
      words: closedWords(c, why),
      door: why && NO_DOOR.includes(why) ? null : CHANNELS_DOOR
    });
  }
  return parts;
}
export function channelsStandingWords(parts) {
  return parts.map((p) => p.words).join(" \xB7 ");
}
