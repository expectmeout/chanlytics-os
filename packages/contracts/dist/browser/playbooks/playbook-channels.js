import { CONSENT_CHANNELS } from "../consent/consent-channels.js";
import {
  DEFAULT_CAMPAIGN_CHANNELS,
  channelChoices,
  channelNeverCarries,
  newCampaignChannels
} from "../broadcasts/reach-for.js";
import { readyForMessage } from "../templates/campaign-message.js";
import { enrolPurpose, messageAboutOfTrigger } from "./playbook-purpose.js";
import { triggerOf } from "./playbook-triggers.js";
export const WHATSAPP_VERSION_ALONE = {
  versions: {
    whatsapp: { id: "", status: "approved", hidden: false, blocked: null, reason: null },
    email: null,
    sms: null
  }
};
export function campaignChannelsOf(channels) {
  const named = CONSENT_CHANNELS.filter((c) => (channels ?? []).includes(c));
  return named.length > 0 ? named : [...DEFAULT_CAMPAIGN_CHANNELS];
}
export function playbookChannelsRead(p, ticks, message, workspace) {
  const trig = triggerOf(p.trigger ?? "");
  const cls = trig?.kind === "saved" ? p.policy_class ?? null : trig?.cls ?? null;
  const purpose = enrolPurpose(cls, message ? { category: message.category } : null);
  const about = messageAboutOfTrigger(p.trigger);
  const ready = message ? readyForMessage(workspace, message) : workspace;
  const choices = channelChoices(ready, purpose, about);
  const open = choices.filter((c) => c.ok).map((c) => c.channel);
  const ticked = ticks === "new" ? newCampaignChannels("playbook", message ? open : null) : CONSENT_CHANNELS.filter((c) => ticks.includes(c));
  const kept = ticked.filter((c) => channelNeverCarries(c, purpose) === null);
  const on = kept.filter((c) => open.includes(c));
  const paused = workspace.paused === true;
  const stands = Object.fromEntries(
    CONSENT_CHANNELS.map((c) => [
      c,
      kept.includes(c) ? on.includes(c) && !paused ? "on" : "waits" : open.includes(c) ? "could" : "off"
    ])
  );
  return { purpose, about, ready, choices, ticked, kept, on, stands };
}
