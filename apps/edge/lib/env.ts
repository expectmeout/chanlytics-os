/**
 * The edge's environment, read in one place.
 *
 * Forty variables were read from `process.env` across thirty-eight files, each
 * site deciding for itself whether a blank counted as unset and what type came
 * back. This module is the one reader. Every getter names its variable
 * literally, so `env-manifest.test.mjs` still sees each read and holds
 * `.env.example` to the same list; a lint rule refuses `process.env` anywhere
 * else on the edge.
 *
 * Two rules, the same for every variable:
 *
 *   - A value is read when it is asked for, never at import. Tests set the
 *     environment per case, and a door that captured a value at module load
 *     would answer for the wrong case. Modules that bind on purpose, such as
 *     the Places client, still do so themselves, visibly.
 *   - Blank is unset. Vercel stores an emptied variable as "", and every
 *     caller here treated "" and undefined alike (`||`, `!!`, `?? ""` then
 *     trim). Trimming once here makes that the rule instead of a habit, and
 *     closes the one place it was not: a blank verify token no longer matches
 *     a blank query string.
 *
 * Parsing stays with the module that owns the meaning: the pager splits
 * LEAD_TO, billing reads BILLING_TRIAL_DAYS as days, the line provider decides
 * what LINES_DRY_RUN and VERCEL_ENV mean together. This file only says which
 * variables exist and hands each back as a trimmed string or undefined.
 *
 * The groups and the order follow `apps/edge/.env.example`, which documents
 * each one.
 *
 * One thing is done at import, and only in production: `assertBootable` at the
 * end of this file. Every door reads its environment through here, so a
 * production edge that lacks what it cannot serve without (REQUIRED_IN_PRODUCTION)
 * logs one line, `env_invalid`, naming what is missing, and refuses to load:
 * every door fails at once, loudly, instead of one at a time on first use.
 * There is no instrumentation hook for plain functions; a module every door
 * loads is the edge's boot.
 */
import { logger } from "./log.js";

function trimmedEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const env = {
  // WhatsApp Cloud API
  get WHATSAPP_VERIFY_TOKEN() {
    return trimmedEnv(process.env.WHATSAPP_VERIFY_TOKEN);
  },
  get WHATSAPP_ACCESS_TOKEN() {
    return trimmedEnv(process.env.WHATSAPP_ACCESS_TOKEN);
  },
  get WHATSAPP_PHONE_ID() {
    return trimmedEnv(process.env.WHATSAPP_PHONE_ID);
  },
  get META_APP_SECRET() {
    return trimmedEnv(process.env.META_APP_SECRET);
  },
  get META_APP_ID() {
    return trimmedEnv(process.env.META_APP_ID);
  },
  get META_ES_CONFIG_ID() {
    return trimmedEnv(process.env.META_ES_CONFIG_ID);
  },
  /**
   * Switch: the Embedded Signup configuration above is a v4 one that offers keeping the WhatsApp Business app
   * (coexistence, decision 0073, R12). "1" lets the first run offer it; empty, a business's WhatsApp moves to a number on
   * Chanlytics, as before, and the screens say so.
   */
  get META_ES_KEEP_APP() {
    return trimmedEnv(process.env.META_ES_KEEP_APP);
  },
  /** Switch: limits who the environment's own pilot number answers; empty answers everyone. */
  get WHATSAPP_TEST_ALLOWLIST() {
    return trimmedEnv(process.env.WHATSAPP_TEST_ALLOWLIST);
  },
  /** Switch: the workspaces whose WhatsApp messages are answered by a job after the webhook's 200; empty, none are. */
  get WHATSAPP_ANSWERS_AS_JOBS() {
    return trimmedEnv(process.env.WHATSAPP_ANSWERS_AS_JOBS);
  },

  // Instagram (the Instagram API with Instagram Login: decision 0001, step 8)
  get INSTAGRAM_APP_ID() {
    return trimmedEnv(process.env.INSTAGRAM_APP_ID);
  },
  get INSTAGRAM_APP_SECRET() {
    return trimmedEnv(process.env.INSTAGRAM_APP_SECRET);
  },
  get INSTAGRAM_VERIFY_TOKEN() {
    return trimmedEnv(process.env.INSTAGRAM_VERIFY_TOKEN);
  },
  get INSTAGRAM_REDIRECT_URI() {
    return trimmedEnv(process.env.INSTAGRAM_REDIRECT_URI);
  },

  // Retell AI and the lines under it
  get RETELL_API_KEY() {
    return trimmedEnv(process.env.RETELL_API_KEY);
  },
  /** The badged key Retell's signature is checked with, the only one; unset, no signature verifies. */
  get RETELL_WEBHOOK_KEY() {
    return trimmedEnv(process.env.RETELL_WEBHOOK_KEY);
  },
  /** Switch: the shared secret that opens the voice doors beside Retell's signature (?key= on the inbound URL, x-fn-secret on the two tools); unset, it opens nothing (a fallback with a sunset). */
  get RETELL_FN_SECRET() {
    return trimmedEnv(process.env.RETELL_FN_SECRET);
  },
  /** Switch: '1' makes Retell's signature the only key to the voice doors. */
  get RETELL_DOORS_SIGNED() {
    return trimmedEnv(process.env.RETELL_DOORS_SIGNED);
  },
  get TWILIO_ACCOUNT_SID() {
    return trimmedEnv(process.env.TWILIO_ACCOUNT_SID);
  },
  get TWILIO_AUTH_TOKEN() {
    return trimmedEnv(process.env.TWILIO_AUTH_TOKEN);
  },
  get TWILIO_PRIMARY_PROFILE_SID() {
    return trimmedEnv(process.env.TWILIO_PRIMARY_PROFILE_SID);
  },
  /** Switch: '1' uses the dry line provider (fake SIDs) on a preview or a laptop. */
  get LINES_DRY_RUN() {
    return trimmedEnv(process.env.LINES_DRY_RUN);
  },
  /** Switch: unset reports ended workspaces' numbers; set warns, then releases them after that many days. */
  get LINE_RELEASE_AFTER_DAYS() {
    return trimmedEnv(process.env.LINE_RELEASE_AFTER_DAYS);
  },

  // Email (Resend)
  get RESEND_API_KEY() {
    return trimmedEnv(process.env.RESEND_API_KEY);
  },
  get LEAD_TO() {
    return trimmedEnv(process.env.LEAD_TO);
  },
  get LEAD_FROM() {
    return trimmedEnv(process.env.LEAD_FROM);
  },
  get SUPPORT_TO() {
    return trimmedEnv(process.env.SUPPORT_TO);
  },
  get EMAIL_DOMAIN() {
    return trimmedEnv(process.env.EMAIL_DOMAIN);
  },
  /**
   * The domain OFFERS by email leave from (One message, every channel, step 4): a sending subdomain on the platform's
   * Resend account (campaigns.chanlytics.com), verified there, so a complaint about an offer never touches the domain
   * replies and visit messages leave from. Blank, or not yet verified: offers by email stay refused, as they were.
   */
  get EMAIL_CAMPAIGNS_DOMAIN() {
    return trimmedEnv(process.env.EMAIL_CAMPAIGNS_DOMAIN);
  },
  get RESEND_WEBHOOK_SECRET() {
    return trimmedEnv(process.env.RESEND_WEBHOOK_SECRET);
  },
  /**
   * The key that seals a cold email's unsubscribe link (Reach out): the SAME value as the dashboard's, whose /u/ page
   * opens them. The mailboxes sweep probes that the two agree (email/unsubscribe-probe.ts). A reach-out writes nothing
   * without it: every cold email carries its one-click unsubscribe in its headers (decision 0056, 7).
   */
  get UNSUBSCRIBE_SECRET() {
    return trimmedEnv(process.env.UNSUBSCRIBE_SECRET);
  },
  /**
   * Where a cold email's unsubscribe links point (Reach out D17): a domain of cold mail's own before scale, so the app's
   * is never judged by cold mail. An https origin only; blank, or anything else, is the dashboard's origin.
   */
  get UNSUBSCRIBE_ORIGIN() {
    return trimmedEnv(process.env.UNSUBSCRIBE_ORIGIN);
  },
  /**
   * Switch: a lead's own receptionist before they sign up (decision 0079). "on" builds a preview where a send names
   * {{their preview}} or a member asks for one; anything else builds none, and such a send waits.
   */
  get LEAD_PREVIEWS() {
    return trimmedEnv(process.env.LEAD_PREVIEWS);
  },

  // Connected mailboxes (decision 0056): the OAuth clients a business connects its Gmail or Microsoft 365 mailbox
  // with, the callback both return to, and how each provider tells the edge a mailbox changed.
  /** Google's OAuth client for mail: a Google Cloud project of its own, apart from Business Profile's. */
  get GOOGLE_MAIL_CLIENT_ID() {
    return trimmedEnv(process.env.GOOGLE_MAIL_CLIENT_ID);
  },
  get GOOGLE_MAIL_CLIENT_SECRET() {
    return trimmedEnv(process.env.GOOGLE_MAIL_CLIENT_SECRET);
  },
  /** Microsoft's app registration for mail (multi-tenant, delegated Mail.Send and Mail.ReadWrite). */
  get MICROSOFT_MAIL_CLIENT_ID() {
    return trimmedEnv(process.env.MICROSOFT_MAIL_CLIENT_ID);
  },
  get MICROSOFT_MAIL_CLIENT_SECRET() {
    return trimmedEnv(process.env.MICROSOFT_MAIL_CLIENT_SECRET);
  },
  /** The dashboard's callback both providers return to, registered on each exactly as written here. */
  get MAILBOX_OAUTH_REDIRECT() {
    return trimmedEnv(process.env.MAILBOX_OAUTH_REDIRECT);
  },
  /** The Pub/Sub topic Gmail publishes a mailbox's changes to (projects/<project>/topics/<name>). */
  get GMAIL_PUSH_TOPIC() {
    return trimmedEnv(process.env.GMAIL_PUSH_TOPIC);
  },
  /** The audience the topic's push subscription signs its token for: the push door checks it. */
  get GMAIL_PUSH_AUDIENCE() {
    return trimmedEnv(process.env.GMAIL_PUSH_AUDIENCE);
  },
  /** The service account the push subscription signs as: a token for the audience from any other is refused. */
  get GMAIL_PUSH_SERVICE_ACCOUNT() {
    return trimmedEnv(process.env.GMAIL_PUSH_SERVICE_ACCOUNT);
  },
  /** The clientState every Graph subscription carries, checked on each notification it sends. */
  get GRAPH_NOTIFY_SECRET() {
    return trimmedEnv(process.env.GRAPH_NOTIFY_SECRET);
  },
  // Push (Expo's push service)
  get EXPO_ACCESS_TOKEN() {
    return trimmedEnv(process.env.EXPO_ACCESS_TOKEN);
  },
  // Apple's push service, spoken to directly for the call in progress on a phone's Lock Screen (lib/ops/apns.ts).
  // All four set, or the port is absent; the key is the .p8's PEM, or a base64 of it.
  get APNS_TEAM_ID() {
    return trimmedEnv(process.env.APNS_TEAM_ID);
  },
  get APNS_KEY_ID() {
    return trimmedEnv(process.env.APNS_KEY_ID);
  },
  get APNS_KEY_P8() {
    return trimmedEnv(process.env.APNS_KEY_P8);
  },
  get APNS_BUNDLE_ID() {
    return trimmedEnv(process.env.APNS_BUNDLE_ID);
  },
  /** Switch: 'on' sends to Apple's sandbox: a development build's tokens are the sandbox's. */
  get APNS_SANDBOX() {
    return trimmedEnv(process.env.APNS_SANDBOX);
  },

  // LLM
  get ANTHROPIC_API_KEY() {
    return trimmedEnv(process.env.ANTHROPIC_API_KEY);
  },

  // Ask spoken (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.2, §3.6): the voice agent's key and id,
  // which mint a conversation's token for a member, and the secret its post-call webhook is signed with.
  /** The ElevenLabs API key: mints the voice agent's conversation tokens and deletes its conversations; never logged. */
  get ELEVENLABS_API_KEY() {
    return trimmedEnv(process.env.ELEVENLABS_API_KEY);
  },
  /**
   * The voice agent this edge mints conversations on, provisioned from code (tooling/scripts/voice/elevenlabs-agent.mjs):
   * production's (`chanlytics-ask`) on production, a laptop's (`chanlytics-ask-dev`, pointed at a tunnel) elsewhere.
   */
  get ELEVENLABS_AGENT_ID() {
    return trimmedEnv(process.env.ELEVENLABS_AGENT_ID);
  },
  /** The secret the vendor signs its post-call webhook with (elevenlabs-signature). */
  get ELEVENLABS_WEBHOOK_SECRET() {
    return trimmedEnv(process.env.ELEVENLABS_WEBHOOK_SECRET);
  },
  /** TypeSafe's key for the second model asked in shadow (decision 0023): never a literal, never logged. */
  get TYPESAFE_API_KEY() {
    return trimmedEnv(process.env.TYPESAFE_API_KEY);
  },
  /** Switch: '1' asks the second model beside the primary for every workspace, a comma-separated list of workspace ids for those alone, with its key set; anything else asks nothing. */
  get TYPESAFE_SHADOW() {
    return trimmedEnv(process.env.TYPESAFE_SHADOW);
  },
  /**
   * Switch: the second model's read made a second key (decision 0084) where a purpose's route names a floor ('1' for
   * every workspace, or a comma-separated list of workspace ids), with its key set: an act the purpose holds on it goes
   * only when it agrees. Anything else holds nothing.
   */
  get TYPESAFE_SECOND_KEY() {
    return trimmedEnv(process.env.TYPESAFE_SECOND_KEY);
  },
  /** Switch: the receptionist's note suggestions (0007 phase 2), on unless 'off'. */
  get NOTE_SUGGESTIONS() {
    return trimmedEnv(process.env.NOTE_SUGGESTIONS);
  },
  /** Switch: Ask's journal (decision 0070), written by the note sweep each night; off unless 'on'. */
  get ASK_JOURNAL() {
    return trimmedEnv(process.env.ASK_JOURNAL);
  },

  // The lead finder
  get APIFY_TOKEN() {
    return trimmedEnv(process.env.APIFY_TOKEN);
  },
  /** A business's page read for what it says and declares (lib/public-page.ts sitePage); unset, none is read. */
  get FIRECRAWL_API_KEY() {
    return trimmedEnv(process.env.FIRECRAWL_API_KEY);
  },
  /** Switch: another Claude model for the lead judge; empty is the registry's. */
  get LEAD_JUDGE_MODEL() {
    return trimmedEnv(process.env.LEAD_JUDGE_MODEL);
  },
  /** Switch: the judge's server-side fallback on a refusal (decision 14), on unless 'off'. */
  get LEAD_JUDGE_FALLBACKS() {
    return trimmedEnv(process.env.LEAD_JUDGE_FALLBACKS);
  },
  get LEAD_WEBHOOK_BASE() {
    return trimmedEnv(process.env.LEAD_WEBHOOK_BASE);
  },

  // Postgres, the receptionist's only memory
  get SUPABASE_URL() {
    return trimmedEnv(process.env.SUPABASE_URL);
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return trimmedEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  },

  // Google
  get GOOGLE_PLACES_API_KEY() {
    return trimmedEnv(process.env.GOOGLE_PLACES_API_KEY);
  },
  get GOOGLE_OAUTH_CLIENT_ID() {
    return trimmedEnv(process.env.GOOGLE_OAUTH_CLIENT_ID);
  },
  get GOOGLE_OAUTH_CLIENT_SECRET() {
    return trimmedEnv(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  },
  get GOOGLE_OAUTH_REDIRECT_URI() {
    return trimmedEnv(process.env.GOOGLE_OAUTH_REDIRECT_URI);
  },
  get GOOGLE_OAUTH_AUDIENCE() {
    return trimmedEnv(process.env.GOOGLE_OAUTH_AUDIENCE);
  },

  // Diagnostics and the dashboard's door
  /** Switch: the platform's shared key: with EDGE_CALL_SECRET set it opens only the knocks that name it (platformKey), on an edge without the secret (a preview) every admin door (a fallback with a sunset). */
  get DIAG_KEY() {
    return trimmedEnv(process.env.DIAG_KEY);
  },
  get EDGE_CALL_SECRET() {
    return trimmedEnv(process.env.EDGE_CALL_SECRET);
  },

  // Origins and billing
  get DASHBOARD_ORIGIN() {
    return trimmedEnv(process.env.DASHBOARD_ORIGIN);
  },
  get EDGE_ORIGIN() {
    return trimmedEnv(process.env.EDGE_ORIGIN);
  },
  get STRIPE_SECRET_KEY() {
    return trimmedEnv(process.env.STRIPE_SECRET_KEY);
  },
  get STRIPE_WEBHOOK_SECRET() {
    return trimmedEnv(process.env.STRIPE_WEBHOOK_SECRET);
  },
  get STRIPE_PRICE_ID() {
    return trimmedEnv(process.env.STRIPE_PRICE_ID);
  },
  /** Stripe's publishable key (pk_…), for the embedded Checkout the first run's Go live mounts (decision 0073, R16). */
  get STRIPE_PUBLISHABLE_KEY() {
    return trimmedEnv(process.env.STRIPE_PUBLISHABLE_KEY);
  },
  get BILLING_TRIAL_DAYS() {
    return trimmedEnv(process.env.BILLING_TRIAL_DAYS);
  },

  // Set by the platform, not by an operator
  get VERCEL_ENV() {
    return trimmedEnv(process.env.VERCEL_ENV);
  },
  /** The commit this deployment was built from: GET /api/version answers it, as the dashboard's does. */
  get VERCEL_GIT_COMMIT_SHA() {
    return trimmedEnv(process.env.VERCEL_GIT_COMMIT_SHA);
  },
};

/** Whether this deployment is production: VERCEL_ENV says so, and nothing else does (an unset one is a laptop). */
export function isProduction(): boolean {
  return env.VERCEL_ENV === "production";
}

/** An https origin as typed (a trailing slash is the same origin), or null when the value is not one. */
export function httpsOriginOf(value: string | undefined): string | null {
  const o = value?.trim().replace(/\/+$/, "") ?? "";
  return /^https:\/\/[a-z0-9.-]+$/i.test(o) ? o : null;
}

/**
 * What a production edge cannot serve without: its memory, the secret the dashboard's calls are verified with (an
 * edge without it lets the platform key open every admin door), and the two addresses it writes into links and hands
 * to providers. DASHBOARD_ORIGIN and EDGE_ORIGIN had production's addresses as code defaults, so a production edge that
 * lost its setting went on writing whatever the default said; production now names them, and only a preview or a
 * laptop keeps the default (dashboard-origin.ts, lines/lines.ts, leads/lead-wires.ts).
 */
const REQUIRED_IN_PRODUCTION = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EDGE_CALL_SECRET",
  "DASHBOARD_ORIGIN",
  "EDGE_ORIGIN",
] as const;

/** The two of those that must be https origins, not merely set. */
const ORIGINS: ReadonlySet<string> = new Set(["DASHBOARD_ORIGIN", "EDGE_ORIGIN"]);

/** What a production environment lacks, by name only (a value is never repeated); none off production. */
export function bootProblems(source: Readonly<Record<string, string | undefined>> = process.env): string[] {
  if (source.VERCEL_ENV?.trim() !== "production") return [];
  return REQUIRED_IN_PRODUCTION.filter((name) => {
    const value = trimmedEnv(source[name]);
    return !value || (ORIGINS.has(name) && !httpsOriginOf(value));
  });
}

/** Refuse to load a production edge that lacks what it cannot serve without: one line naming it, then a throw. */
export function assertBootable(source: Readonly<Record<string, string | undefined>> = process.env): void {
  const missing = bootProblems(source);
  if (!missing.length) return;
  logger().error("env_invalid", { missing });
  throw new Error(`env_invalid: this production edge cannot serve without ${missing.join(", ")}`);
}

assertBootable();
