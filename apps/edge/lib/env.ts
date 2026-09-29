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
 */

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
  get WHATSAPP_TEST_ALLOWLIST() {
    return trimmedEnv(process.env.WHATSAPP_TEST_ALLOWLIST);
  },

  // Retell AI and the lines under it
  get RETELL_API_KEY() {
    return trimmedEnv(process.env.RETELL_API_KEY);
  },
  get RETELL_WEBHOOK_KEY() {
    return trimmedEnv(process.env.RETELL_WEBHOOK_KEY);
  },
  get RETELL_FN_SECRET() {
    return trimmedEnv(process.env.RETELL_FN_SECRET);
  },
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
  get LINES_DRY_RUN() {
    return trimmedEnv(process.env.LINES_DRY_RUN);
  },
  get LINE_RELEASE_AFTER_DAYS() {
    return trimmedEnv(process.env.LINE_RELEASE_AFTER_DAYS);
  },

  // Email (Resend)
  get RESEND_API_KEY() {
    return trimmedEnv(process.env.RESEND_API_KEY);
  },
  /**
   * The cold mail account's key (Reach out): a workspace's own sending domains are created, checked and sent from on
   * it, so one business's cold mail cannot touch the reminders and replies every workspace sends on RESEND_API_KEY.
   * Absent, own domains are off here: the Connections block is not drawn and the domains clock answers 503.
   */
  get RESEND_COLD_API_KEY() {
    return trimmedEnv(process.env.RESEND_COLD_API_KEY);
  },
  get LEAD_TO() {
    return trimmedEnv(process.env.LEAD_TO);
  },
  get LEAD_FROM() {
    return trimmedEnv(process.env.LEAD_FROM);
  },
  get EMAIL_DOMAIN() {
    return trimmedEnv(process.env.EMAIL_DOMAIN);
  },
  get RESEND_WEBHOOK_SECRET() {
    return trimmedEnv(process.env.RESEND_WEBHOOK_SECRET);
  },
  /** The cold account's webhook secret (Reach out): its receipts come to the same door, proven with this one. */
  get RESEND_COLD_WEBHOOK_SECRET() {
    return trimmedEnv(process.env.RESEND_COLD_WEBHOOK_SECRET);
  },
  /**
   * The key that seals a cold email's unsubscribe link (Reach out): the SAME value as the dashboard's, whose /u/ page
   * opens them. The domains sweep probes that the two agree (email/unsubscribe-probe.ts).
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
   * The domain a cold email's replies come back on (Reach out D17): the mailbox's reply routes there, received on the
   * platform's account like EMAIL_DOMAIN, which keeps receiving the replies to older emails. Blank = EMAIL_DOMAIN.
   */
  get COLD_REPLY_DOMAIN() {
    return trimmedEnv(process.env.COLD_REPLY_DOMAIN);
  },
  /**
   * The cold reply domain before the one set now (D17): replies to the cold emails already sent from it keep routing
   * to their workspace, and an email queued before the move still leaves, while it winds down (docs/runbook.md). Set
   * it when COLD_REPLY_DOMAIN moves or is unset; clear it once no reply can still come there. Blank = none.
   */
  get COLD_REPLY_DOMAIN_PREVIOUS() {
    return trimmedEnv(process.env.COLD_REPLY_DOMAIN_PREVIOUS);
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
  /** 'on' sends to Apple's sandbox: a development build's tokens are the sandbox's. */
  get APNS_SANDBOX() {
    return trimmedEnv(process.env.APNS_SANDBOX);
  },

  // LLM
  get ANTHROPIC_API_KEY() {
    return trimmedEnv(process.env.ANTHROPIC_API_KEY);
  },
  /** The receptionist's note suggestions (0007 phase 2): on unless 'off'. */
  get NOTE_SUGGESTIONS() {
    return trimmedEnv(process.env.NOTE_SUGGESTIONS);
  },

  // The lead finder
  get APIFY_TOKEN() {
    return trimmedEnv(process.env.APIFY_TOKEN);
  },
  get LEAD_JUDGE_MODEL() {
    return trimmedEnv(process.env.LEAD_JUDGE_MODEL);
  },
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
  get BILLING_TRIAL_DAYS() {
    return trimmedEnv(process.env.BILLING_TRIAL_DAYS);
  },

  // Set by the platform, not by an operator
  get VERCEL_ENV() {
    return trimmedEnv(process.env.VERCEL_ENV);
  },
};
