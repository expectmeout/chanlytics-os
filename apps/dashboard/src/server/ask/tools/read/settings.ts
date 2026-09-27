import "server-only";
import { z } from "zod";
import { dealsAreOn, parseTenantConfig, policyClassOffered } from "@chanlytics/contracts";
import { load } from "../../../readers";
import { channels as channelsReader } from "../../../readers/channels";
import * as readers from "../../../readers/facts";
import { workspaceFacts } from "../../prompt";
import { defineRead, unread, type ToolContext } from "../context";

async function getSettings(t: ToolContext): Promise<unknown> {
  // The facts the receptionist runs on, composed from the turn's reads -- never the settings page's own read
  // (readers/settings.ts), whose prompt preview fetches the calendar feed and reads the Autonomy rows again, which a
  // question about the hours must not pay for.
  const [{ name, timezone }, cfgRow, all, chans, sellsBy] = await Promise.all([
    load(t.rc, readers.facts, undefined).then((r) => r.data),
    load(t.rc, readers.config, undefined).then((r) => r.data),
    load(t.rc, readers.policies, undefined).then(
      (r) => r.data,
      () => [],
    ),
    // The channels as their page reads them (readers/channels.ts), once a turn: list_audiences reads the same rows. A
    // read that fails is said as its own state, never as no channels, and the rest of the settings still answer.
    load(t.rc, channelsReader, undefined).then((r) => r.data.channels, unread(t, "get_settings", "channels")),
    load(t.rc, readers.sellsBy, undefined).then((r) => r.data),
  ]);
  // The Autonomy rows offered here, as the pane draws them: the follow-ups' only where deals are on (0006).
  const policies = all.filter((p) => policyClassOffered(p.class, dealsAreOn(sellsBy)));
  const cfg = parseTenantConfig(cfgRow?.config ?? null);
  const facts = workspaceFacts(name, timezone, cfgRow?.config ?? null, policies);
  return {
    business: facts.businessName,
    timezone,
    hours: facts.hoursLines,
    closures: facts.closures,
    services: facts.services,
    languages: facts.languages,
    guardrails: facts.guardrails,
    notes: facts.notes,
    booking_rules: cfg?.brain?.profile?.booking_rules ?? null,
    escalate_when: cfg?.brain?.profile?.escalate_when ?? [],
    calendar_connected: facts.hasCalendar,
    vision: facts.visionOn,
    notifications: cfg?.notifications
      ? {
          escalation_emails:
            t.role === "owner" ? cfg.notifications.escalation_emails : cfg.notifications.escalation_emails.length,
        }
      : null,
    policies: policies.map((p) => ({ class: p.class, mode: p.mode, limits: p.limits })),
    // The same three fields, in the page's order: by kind. Null: they could not be read, which is not none.
    channels: chans ? chans.map((c) => ({ kind: c.kind, status: c.status, number: c.number_e164 })) : null,
    config_version: cfgRow?.version ?? null,
    ...(chans ? {} : { could_not_read: ["The channels could not be read just now."] }),
  };
}

export const get_settings = defineRead({
  name: "get_settings",
  description:
    "The workspace's settings as the receptionist runs on them: the business and its time zone, hours, closures, services, languages, guardrails, notes, booking rules, when it escalates, whether the calendar and vision are on, the notifications, the autonomy rows with their modes and limits (the reply policy's dials among them), and which channels are connected with their numbers. Call it for the reply policy's dials, the channels and the notifications; the hours, closures, services, notes, guardrails, booking notes and the autonomy modes are already in this prompt, so answer those from here without a read. A channels read that failed is said in could_not_read, never as no channels. Nothing changes because it was read; propose_settings is what changes a setting.",
  input: z.object({}),
  label: "Reading Settings",
  run: getSettings,
});
