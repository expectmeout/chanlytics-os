/**
 * The dashboard's environment, read in one place.
 *
 * Forty-nine reads of `process.env` in twenty-three files each decided for itself whether a blank counted as unset,
 * what type came back and what a missing value meant, and nothing said at boot that a production deployment lacked
 * something it could not serve without: it found out on the first request that needed it. This module is the
 * server's one reader, as `apps/edge/lib/env.ts` is the edge's:
 *
 *   - Every variable is named once, literally, in `READ` below (the public ones through `src/lib/public-env.ts`, the
 *     browser's reader), so `env-manifest.test.mjs` sees each read and holds `apps/dashboard/.env.example` to the
 *     same list. A lint rule refuses `process.env` anywhere else in the dashboard.
 *   - One zod schema says what each one is: a trimmed string, an origin, a word from a closed set. Blank is unset.
 *     A value its schema refuses reads as unset, never as itself, and `bootProblems` names it.
 *   - A value is read when it is asked for, never at import: tests set the environment per case, and a module that
 *     captured a value at load would answer for the wrong one.
 *   - `REQUIRED_IN_PRODUCTION` is what a production deployment cannot serve without. `instrumentation.ts` asks
 *     `bootProblems()` before the first request and refuses to serve, with one line naming what
 *     is missing, rather than fail on the first use of it. A preview or a laptop keeps working without them.
 *
 * No `server-only` here: next.config.ts reads the build's commit through it, at build, outside any bundle. Browser
 * code cannot import it all the same (eslint.config.mjs, BROWSER_MAY_NOT_IMPORT), and no secret here is `NEXT_PUBLIC_`,
 * so nothing would reach a bundle if it did.
 */
import { z } from "zod";
import { publicEnv } from "../lib/public-env";

/** Blank is unset: Vercel stores an emptied variable as "", and whitespace around a pasted value is never meant. */
const blankAsUnset = (value: unknown): unknown => (typeof value === "string" ? value.trim() || undefined : value);

const optionalText = z.preprocess(blankAsUnset, z.string().optional());

/** An origin: a scheme and a host, no path; a trailing slash is the same origin. */
const origin = z.preprocess(
  (value) => (typeof value === "string" ? blankAsUnset(value.trim().replace(/\/+$/, "")) : value),
  z
    .string()
    .regex(/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i, "an origin: http(s)://host, no path")
    .optional(),
);

/** A host name, as the browser sends it in `Host`. */
const host = z.preprocess(
  blankAsUnset,
  z
    .string()
    .regex(/^[a-z0-9.-]+(:\d+)?$/i, "a host name, no scheme")
    .optional(),
);

const url = z.preprocess(blankAsUnset, z.url().optional());

const oneOf = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(blankAsUnset, z.enum(values).optional());

/** Every variable the dashboard's server reads, and what each must be. The order follows `.env.example`. */
const SCHEMA = {
  // Supabase: the browser half, read through public-env.ts, and the server's own key.
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalText,
  NEXT_PUBLIC_LEAD_MAP_BASE: optionalText,
  SUPABASE_SERVICE_ROLE_KEY: optionalText,

  // The edge: where it is, and the credentials a call to it carries.
  DIAG_KEY: optionalText,
  EDGE_URL: origin,
  EDGE_CALL_SECRET: optionalText,

  // Reach out's unsubscribe links, and the email channel's domain.
  UNSUBSCRIBE_SECRET: optionalText,
  UNSUBSCRIBE_SECRET_PREVIOUS: optionalText,
  UNSUBSCRIBE_ORIGIN: optionalText,
  EMAIL_DOMAIN: optionalText,

  // Google's OAuth state, the providers switch, Ask's model.
  GOOGLE_OAUTH_STATE_SECRET: optionalText,
  EDGE_PROVIDERS: oneOf(["live"]),
  ASK_MODEL: optionalText,

  // The product's one address.
  CANONICAL_HOST: host,

  // Sign-up, the phone app's links and the oldest app spoken to.
  SIGNUP_CODE: optionalText,
  APP_LINKS_APPLE: optionalText,
  APP_LINKS_ANDROID: optionalText,
  MIN_APP_VERSION: optionalText,

  // Set by the platform, not by an operator.
  VERCEL_ENV: oneOf(["production", "preview", "development"]),
  VERCEL_GIT_COMMIT_SHA: optionalText,
  NEXT_RUNTIME: oneOf(["nodejs", "edge"]),
} as const;

type Name = keyof typeof SCHEMA;
type DashboardEnv = { readonly [K in Name]: z.output<(typeof SCHEMA)[K]> };

/** Each variable's one read, by its literal name. The public ones are the browser's reader's, so there is one each. */
const READ: { readonly [K in Name]: () => string | undefined } = {
  NEXT_PUBLIC_SUPABASE_URL: () => publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: () => publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_LEAD_MAP_BASE: () => publicEnv.NEXT_PUBLIC_LEAD_MAP_BASE,
  SUPABASE_SERVICE_ROLE_KEY: () => process.env.SUPABASE_SERVICE_ROLE_KEY,
  DIAG_KEY: () => process.env.DIAG_KEY,
  EDGE_URL: () => process.env.EDGE_URL,
  EDGE_CALL_SECRET: () => process.env.EDGE_CALL_SECRET,
  UNSUBSCRIBE_SECRET: () => process.env.UNSUBSCRIBE_SECRET,
  UNSUBSCRIBE_SECRET_PREVIOUS: () => process.env.UNSUBSCRIBE_SECRET_PREVIOUS,
  UNSUBSCRIBE_ORIGIN: () => process.env.UNSUBSCRIBE_ORIGIN,
  EMAIL_DOMAIN: () => process.env.EMAIL_DOMAIN,
  GOOGLE_OAUTH_STATE_SECRET: () => process.env.GOOGLE_OAUTH_STATE_SECRET,
  EDGE_PROVIDERS: () => process.env.EDGE_PROVIDERS,
  ASK_MODEL: () => process.env.ASK_MODEL,
  CANONICAL_HOST: () => process.env.CANONICAL_HOST,
  SIGNUP_CODE: () => process.env.SIGNUP_CODE,
  APP_LINKS_APPLE: () => process.env.APP_LINKS_APPLE,
  APP_LINKS_ANDROID: () => process.env.APP_LINKS_ANDROID,
  MIN_APP_VERSION: () => process.env.MIN_APP_VERSION,
  VERCEL_ENV: () => process.env.VERCEL_ENV,
  VERCEL_GIT_COMMIT_SHA: () => process.env.VERCEL_GIT_COMMIT_SHA,
  NEXT_RUNTIME: () => process.env.NEXT_RUNTIME,
};

/** One variable, read now and held to its schema: a value the schema refuses is unset. */
function readOne<K extends Name>(name: K): DashboardEnv[K] {
  const parsed = SCHEMA[name].safeParse(READ[name]());
  return (parsed.success ? parsed.data : undefined) as DashboardEnv[K];
}

/** The environment, typed: each property reads its variable when it is asked for. */
export const env: DashboardEnv = Object.defineProperties(
  {},
  Object.fromEntries(
    (Object.keys(SCHEMA) as Name[]).map((name) => [name, { get: () => readOne(name), enumerable: true }]),
  ),
) as DashboardEnv;

/**
 * What a production deployment cannot serve without: the database, the edge it calls and the secret those calls
 * are signed with, and the address it prints. EDGE_URL and CANONICAL_HOST had production's addresses as code
 * defaults, so a production deployment that lost its setting went on quietly calling or printing whatever the
 * default said; now production names them or does not start, and only a preview or a laptop keeps the default.
 * EDGE_CALL_SECRET is here because without it every call carries DIAG_KEY, the one key that opens every door on an
 * edge that holds no secret.
 */
export const REQUIRED_IN_PRODUCTION = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EDGE_URL",
  "EDGE_CALL_SECRET",
  "CANONICAL_HOST",
] as const satisfies readonly Name[];

/** What is wrong with an environment, by name only (a value is never repeated): unset where required, or unreadable. */
interface EnvProblems {
  /** Required in production and unset (or blank). */
  missing: string[];
  /** Set, and refused by its schema: read as unset everywhere. */
  malformed: string[];
}

/** The problems of an environment given as plain values (a test's, or this process's through `bootProblems`). */
export function problemsIn(source: Readonly<Record<string, string | undefined>>): EnvProblems {
  const production = source.VERCEL_ENV?.trim() === "production";
  const missing: string[] = [];
  const malformed: string[] = [];
  for (const name of Object.keys(SCHEMA) as Name[]) {
    const raw = source[name];
    const parsed = SCHEMA[name].safeParse(raw);
    if (!parsed.success) malformed.push(name);
    else if (production && parsed.data === undefined && (REQUIRED_IN_PRODUCTION as readonly string[]).includes(name))
      missing.push(name);
  }
  // Production speaks to its edge and prints its address over https only.
  if (production) {
    const edge = SCHEMA.EDGE_URL.safeParse(source.EDGE_URL);
    if (edge.success && edge.data && !edge.data.startsWith("https://")) malformed.push("EDGE_URL");
  }
  return { missing, malformed };
}

/** This process's problems: every variable read once, now. */
export function bootProblems(): EnvProblems {
  const snapshot = Object.fromEntries((Object.keys(SCHEMA) as Name[]).map((name) => [name, READ[name]()]));
  return problemsIn(snapshot);
}

type DeploymentEnv = "production" | "preview" | "development";

interface Deployment {
  env: DeploymentEnv;
  /**
   * Whether this deployment may reach the real providers through the edge:
   * buy a number, file a registration, connect a WhatsApp number, sync
   * templates, open Checkout, speak into a live call, run the model.
   */
  providersLive: boolean;
}

/**
 * What a deployment may do, decided once and read everywhere.
 *
 * Twelve server functions each asked whether VERCEL_ENV was "production"
 * before touching a provider, so Connections, Ask and templates could not be
 * rehearsed anywhere else, and a new guard was one more copy of the
 * question. Production reaches the real providers. A preview or a laptop
 * reaches them only when EDGE_PROVIDERS=live says its EDGE_URL points at an
 * edge that holds sandbox keys; otherwise every such call answers "not
 * here" (reason: "preview"). An unset VERCEL_ENV is a laptop, never
 * production: the guard once fired only when the variable was set, and
 * plain local dev mirrored pauses into the live store.
 */
export function deploymentFrom(source: { VERCEL_ENV?: string; EDGE_PROVIDERS?: string }): Deployment {
  const name: DeploymentEnv =
    source.VERCEL_ENV === "production" || source.VERCEL_ENV === "preview" ? source.VERCEL_ENV : "development";
  return { env: name, providersLive: name === "production" || source.EDGE_PROVIDERS === "live" };
}

/** This deployment, decided as the server starts: its variables change only with a redeploy. */
export const deployment: Deployment = deploymentFrom({
  VERCEL_ENV: env.VERCEL_ENV,
  EDGE_PROVIDERS: env.EDGE_PROVIDERS,
});

/**
 * Whether this deployment is served over https, read now: a Vercel production or preview is, a laptop (an unset
 * VERCEL_ENV, or `vercel dev`) is plain http. The session's cookies are Secure exactly here (lib/supabase/cookie-options.ts).
 */
export function servedOverHttps(): boolean {
  return deploymentFrom({ VERCEL_ENV: env.VERCEL_ENV }).env !== "development";
}

/** Whether this deployment is production, read now, by the same rule as `deployment`: an unset VERCEL_ENV is a laptop. */
export function isProduction(): boolean {
  return deploymentFrom({ VERCEL_ENV: env.VERCEL_ENV }).env === "production";
}
