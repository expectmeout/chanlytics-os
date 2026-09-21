/**
 * Disaster-recovery fallback for the ENV-DEFAULT tenant only (PRD E4).
 *
 * When the control plane cannot be READ (infra blip — never mere absence of
 * config), the tenant whose channel matches WHATSAPP_PHONE_ID may fall back to
 * this profile, exactly as credentials fall back to env vars. Any other tenant
 * fails safe into silence: a leaked persona is worse than a missed auto-reply.
 *
 * THE PROFILE IS CONFIGURATION, NOT SOURCE. This file used to hold the
 * profile as a literal — one live workspace's name, its booking link, the
 * number it published, the words it greets customers with, and its owner's
 * personal address — because the fallback has to answer while the database it
 * would read is the thing that is down. That made a repository the store of a
 * customer's data: every contributor, every fork and every clone carried it,
 * and a golden test plus a generator script existed only to keep the copy in
 * step with the row it duplicated.
 *
 * The facts now arrive the way the credentials beside them always have: from
 * the environment of the deployment that answers for that customer.
 *
 *   DR_FALLBACK_BRAIN_JSON         the brain config, as JSON — what the
 *                                  receptionist says while the read is down
 *   DR_FALLBACK_ESCALATION_EMAILS  who is told, comma-separated
 *   DR_FALLBACK_FROM               the sender those notices leave from
 *
 * `tooling/scripts/refresh-dr-fallback.mjs` prints the exact values to set
 * from the stored row, so the operator copies rather than composes, and the
 * control-plane integration test still holds the two identical wherever
 * DR_FALLBACK_BRAIN_JSON is set.
 *
 * READ ONCE, AT LOAD, AND NEVER THROWN. A lambda that threw here would refuse
 * every message on the pilot line over a mistyped variable — the opposite of
 * what a disaster-recovery path is for. A value that is absent, unparseable or
 * invalid is logged and the neutral default below stands in: the receptionist
 * still answers, and says nothing it cannot know.
 */
import type { BrainConfig, NotificationsConfig } from "./packages/contracts.js";
import { parseTenantConfigResult } from "./packages/contracts.js";
import { platformFrom, platformTo } from "./notify.js";

/**
 * What answers when the environment says nothing.
 *
 * It claims NO business fact: no name, no link, no number, no hours. It says
 * what it is — an automated assistant — and that a person will follow up on
 * anything specific, which is the one promise the platform can keep for a
 * workspace whose details it cannot read.
 *
 * `business_name` and `booking_link` are the two fields BrainConfigSchema
 * requires and the only two here that could state a fact, so they are EMPTY
 * rather than invented. That is the product's own "no link" state, not a
 * special case: `resolveFacts` reads an empty string as absent, so
 * `fallbackMessages` drops any sentence that would have named the detail, and
 * `steps.ts` already asks `!!brainCfg.booking_link` before it claims a reply
 * carries one. Nothing below names a detail at all, so nothing is dropped and
 * nothing is filled — these three go out exactly as written. An invented
 * placeholder URL would parse where these do not, and would be a link a
 * customer could be sent to.
 */
const NEUTRAL_BRAIN: BrainConfig = {
  business_name: "",
  booking_link: "",
  fallbacks: {
    greeting:
      "Hi! Thanks for your message. You've reached an automated assistant, and a member of the team will follow up on anything specific.",
    error:
      "Thanks for your message! It couldn't be answered automatically just now, but a member of the team will reply here soon.",
    non_text:
      "Thanks for your message! A member of the team will take a look and reply here soon.",
  },
  system_prompt: `You are an automated assistant answering inbound customer messages while the settings that hold this business's details cannot be read. You do not know its name, address, hours, prices, services or booking link: never guess one and never state one. Be warm and brief, say plainly what you cannot answer right now, and tell the customer that a person will follow up on anything specific.`,
};

/**
 * The operator's brain config, through the SAME door a stored row goes
 * through: `parseTenantConfigResult`, the helper `tenant-runtime.ts` parses
 * `tenant_config.config` with. A value that survives it is a value the
 * receptionist would have accepted from the database, checked by the same zod
 * schema, and a value that does not is named in the log the way a broken row
 * is — `brain.booking_link: Invalid URL` — rather than crashing the import.
 */
function brainFromEnv(): BrainConfig | null {
  const raw = (process.env.DR_FALLBACK_BRAIN_JSON || "").trim();
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    console.error("dr_fallback_brain_unparseable", JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    return null;
  }
  const parsed = parseTenantConfigResult({ brain: json });
  if (!parsed.ok) {
    console.error("dr_fallback_brain_invalid", JSON.stringify({ issues: parsed.issues.slice(0, 5) }));
    return null;
  }
  if (!parsed.config.brain) {
    console.error("dr_fallback_brain_invalid", JSON.stringify({ issues: ["brain: expected an object"] }));
    return null;
  }
  return parsed.config.brain;
}

/**
 * Who is told while the control plane is unreadable, and from where.
 *
 * Absent, it falls to the platform's own pager — LEAD_TO and LEAD_FROM, the
 * pair `notify.ts` already addresses platform mail with — because the tenant
 * this path serves is the env-default one, the single workspace whose owner IS
 * that mailbox (`chooseAddressing`, kind "platform"). No personal address is
 * written down here: an operator who wants a different one sets
 * DR_FALLBACK_ESCALATION_EMAILS.
 *
 * An empty list is a safe answer, not a broken one: `chooseAddressing` then
 * skips the tenant branch and pages the platform, and a workspace it cannot
 * address is told about in redacted form rather than in a stranger's inbox.
 */
function notificationsFromEnv(): NotificationsConfig {
  const configured = (process.env.DR_FALLBACK_ESCALATION_EMAILS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const from = (process.env.DR_FALLBACK_FROM || "").trim() || platformFrom();
  return {
    escalation_emails: configured.length ? configured : platformTo(),
    ...(from ? { from } : {}),
  };
}

export const FALLBACK_NOTIFICATIONS: NotificationsConfig = notificationsFromEnv();

export const FALLBACK_BRAIN: BrainConfig = brainFromEnv() ?? NEUTRAL_BRAIN;
