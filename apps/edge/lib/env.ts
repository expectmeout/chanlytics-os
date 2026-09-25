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

function read(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const env = {
  // WhatsApp Cloud API
  get WHATSAPP_VERIFY_TOKEN() {
    return read(process.env.WHATSAPP_VERIFY_TOKEN);
  },
  get WHATSAPP_ACCESS_TOKEN() {
    return read(process.env.WHATSAPP_ACCESS_TOKEN);
  },
  get WHATSAPP_PHONE_ID() {
    return read(process.env.WHATSAPP_PHONE_ID);
  },
  get META_APP_SECRET() {
    return read(process.env.META_APP_SECRET);
  },
  get META_APP_ID() {
    return read(process.env.META_APP_ID);
  },
  get META_ES_CONFIG_ID() {
    return read(process.env.META_ES_CONFIG_ID);
  },
  get WHATSAPP_TEST_ALLOWLIST() {
    return read(process.env.WHATSAPP_TEST_ALLOWLIST);
  },

  // Retell AI and the lines under it
  get RETELL_API_KEY() {
    return read(process.env.RETELL_API_KEY);
  },
  get RETELL_WEBHOOK_KEY() {
    return read(process.env.RETELL_WEBHOOK_KEY);
  },
  get RETELL_FN_SECRET() {
    return read(process.env.RETELL_FN_SECRET);
  },
  get RETELL_DOORS_SIGNED() {
    return read(process.env.RETELL_DOORS_SIGNED);
  },
  get TWILIO_ACCOUNT_SID() {
    return read(process.env.TWILIO_ACCOUNT_SID);
  },
  get TWILIO_AUTH_TOKEN() {
    return read(process.env.TWILIO_AUTH_TOKEN);
  },
  get TWILIO_PRIMARY_PROFILE_SID() {
    return read(process.env.TWILIO_PRIMARY_PROFILE_SID);
  },
  get LINES_DRY_RUN() {
    return read(process.env.LINES_DRY_RUN);
  },
  get LINE_RELEASE_AFTER_DAYS() {
    return read(process.env.LINE_RELEASE_AFTER_DAYS);
  },

  // Email (Resend)
  get RESEND_API_KEY() {
    return read(process.env.RESEND_API_KEY);
  },
  /**
   * The cold mail account's key (Reach out): a workspace's own sending domains are created, checked and sent from on
   * it, so one business's cold mail cannot touch the reminders and replies every workspace sends on RESEND_API_KEY.
   * Absent, own domains are off here: the Connections block is not drawn and the domains clock answers 503.
   */
  get RESEND_COLD_API_KEY() {
    return read(process.env.RESEND_COLD_API_KEY);
  },
  get LEAD_TO() {
    return read(process.env.LEAD_TO);
  },
  get LEAD_FROM() {
    return read(process.env.LEAD_FROM);
  },
  get EMAIL_DOMAIN() {
    return read(process.env.EMAIL_DOMAIN);
  },
  get RESEND_WEBHOOK_SECRET() {
    return read(process.env.RESEND_WEBHOOK_SECRET);
  },
  // Push (Expo's push service)
  get EXPO_ACCESS_TOKEN() {
    return read(process.env.EXPO_ACCESS_TOKEN);
  },

  // LLM
  get ANTHROPIC_API_KEY() {
    return read(process.env.ANTHROPIC_API_KEY);
  },
  /** The receptionist's note suggestions (0007 phase 2): on unless 'off'. */
  get NOTE_SUGGESTIONS() {
    return read(process.env.NOTE_SUGGESTIONS);
  },

  // The lead finder
  get APIFY_TOKEN() {
    return read(process.env.APIFY_TOKEN);
  },
  get LEAD_JUDGE_MODEL() {
    return read(process.env.LEAD_JUDGE_MODEL);
  },
  get LEAD_JUDGE_FALLBACKS() {
    return read(process.env.LEAD_JUDGE_FALLBACKS);
  },
  get LEAD_WEBHOOK_BASE() {
    return read(process.env.LEAD_WEBHOOK_BASE);
  },

  // Postgres, the receptionist's only memory
  get SUPABASE_URL() {
    return read(process.env.SUPABASE_URL);
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return read(process.env.SUPABASE_SERVICE_ROLE_KEY);
  },

  // Google
  get GOOGLE_PLACES_API_KEY() {
    return read(process.env.GOOGLE_PLACES_API_KEY);
  },
  get GOOGLE_OAUTH_CLIENT_ID() {
    return read(process.env.GOOGLE_OAUTH_CLIENT_ID);
  },
  get GOOGLE_OAUTH_CLIENT_SECRET() {
    return read(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  },
  get GOOGLE_OAUTH_REDIRECT_URI() {
    return read(process.env.GOOGLE_OAUTH_REDIRECT_URI);
  },
  get GOOGLE_OAUTH_AUDIENCE() {
    return read(process.env.GOOGLE_OAUTH_AUDIENCE);
  },

  // Diagnostics and the dashboard's door
  get DIAG_KEY() {
    return read(process.env.DIAG_KEY);
  },
  get EDGE_CALL_SECRET() {
    return read(process.env.EDGE_CALL_SECRET);
  },

  // Origins and billing
  get DASHBOARD_ORIGIN() {
    return read(process.env.DASHBOARD_ORIGIN);
  },
  get EDGE_ORIGIN() {
    return read(process.env.EDGE_ORIGIN);
  },
  get STRIPE_SECRET_KEY() {
    return read(process.env.STRIPE_SECRET_KEY);
  },
  get STRIPE_WEBHOOK_SECRET() {
    return read(process.env.STRIPE_WEBHOOK_SECRET);
  },
  get STRIPE_PRICE_ID() {
    return read(process.env.STRIPE_PRICE_ID);
  },
  get BILLING_TRIAL_DAYS() {
    return read(process.env.BILLING_TRIAL_DAYS);
  },

  // Set by the platform, not by an operator
  get VERCEL_ENV() {
    return read(process.env.VERCEL_ENV);
  },
};

export type EdgeEnv = typeof env;
