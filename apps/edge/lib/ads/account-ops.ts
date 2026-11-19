/**
 * POST /api/admin/ads/account: an owner's own ad account at Meta (decision 0049, step P1; the Ads plan's step 2).
 * Signed admin token only: the dashboard's /api/v1/ads routes are the callers, for the owner. The Meta app's secret,
 * every token and Meta's wire live on the edge and nowhere else.
 *
 *   status    Whether this deployment holds the app's sign-in for ads, whether it offers Ads in this workspace (the
 *             plan's D7: until Meta's review passes, the workspaces ADS_WORKSPACES lists), and the public half of the
 *             app the dashboard builds the way to Meta's window from.
 *   connect   The code becomes the business's token; Meta says what it may do, and it must read ads or nothing is
 *             written. The ad accounts and Pages the business shared are read. Chanlytics picks the Page (the one
 *             linked to the number AI answers) and the ad account (the one that Page's ads run from), and where two
 *             accounts could both be the one, the row waits with both for the owner's answer. One door then writes
 *             the row, the token in Vault, the owner's decision and the event together (ad_account_connect).
 *   choose    The owner's answer to which of two: the account is read again, and the same door finishes the connect.
 *   check     Chanlytics looks again: the account and its Page as Meta describes them now, kept on the row. Asked when
 *             the owner comes back from mending something at Meta, and never faster than Meta's pace allows.
 *
 * The owner alone: `has_permission(…, 'ads')` is asked here before anything is asked of Meta, and again by the door
 * that writes. Every answer is JSON with `ok`; a refusal is a code (http.ts refuse) with words for support in `detail`.
 * The lines carry an account's id, never a token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { metaReachOf, parseMetaTokenUser } from "@chanlytics/channels/ads";
import {
  metaBusinessRequest,
  metaCodeRequest,
  metaDebugTokenRequest,
  parseMetaBusiness,
  parseMetaDebugToken,
  parseMetaToken,
  type MetaApp,
} from "@chanlytics/channels/meta";
import { callMetaAds } from "@chanlytics/channels/ads";
import {
  connectAdAccount,
  findLiveAdAccount,
  keepAdAccountRead,
  markAdAccountRevoked,
  mayRunAds,
  readAdSecret,
  type AdAccountRow,
  type AdConnectOutcome,
} from "@chanlytics/db/ads";
import { findChannelNumber } from "@chanlytics/db/channels";
import type { Database, Json } from "@chanlytics/db/types";
import {
  isTenantId,
  metaAdConfigOf,
  UUID,
  type AdAccountChoice,
  type MetaAdConfig,
  type TenantId,
} from "@chanlytics/contracts";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { env } from "../shared/env.js";
import { json, refuse } from "../shared/http.js";
import { logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import { metaAppId } from "../whatsapp/meta-graph.js";
import {
  accountConfigOf,
  askMetaAds,
  pageConfigOf,
  readMetaAccount,
  readMetaPage,
  runsPage,
  sharedIds,
  standingOf,
  type MetaSignIn,
} from "./meta-facts.js";
import { mayAskMeta, readAfterOf } from "./pace.js";
import { pickAccount, pickPage, type AccountSeen } from "./pick.js";

type Db = SupabaseClient<Database>;
type Log = ReturnType<typeof logger>;

/** What the door reads of its body. */
export interface AdsAccountBody {
  op?: string;
  tenant_id?: string;
  user_id?: string;
  code?: string;
  external_id?: string;
}

/** The Meta app's sign-in for ads as this deployment holds it, or null when any part is not set. */
export function metaAdsApp(): MetaApp | null {
  const clientSecret = env.META_APP_SECRET;
  const configId = env.META_ADS_CONFIG_ID;
  const redirectUri = env.META_ADS_REDIRECT_URI;
  return clientSecret && configId && redirectUri
    ? { clientId: metaAppId(), clientSecret, configId, redirectUri }
    : null;
}

/** Whether this deployment offers Ads in a workspace (the plan's D7): ADS_WORKSPACES names it, or names every one. */
export function adsOfferedIn(tenantId: string): boolean {
  const listed = (env.ADS_WORKSPACES ?? "").split(",").map((id) => id.trim());
  return listed.includes("*") || listed.includes(tenantId);
}

/** What an account's token is kept as in Vault. */
interface AdSecret {
  access_token: string;
  expires_at: string | null;
  scopes: string[];
  business_id: string | null;
  user_id: string | null;
  kept_at: string;
}

/** The sign-in a kept account's calls carry, or null where Vault holds no token for it. */
export async function signInOf(db: Db, app: MetaApp, accountId: string): Promise<MetaSignIn | null> {
  const kept = await readAdSecret(db, accountId);
  const token = typeof kept?.access_token === "string" ? kept.access_token : "";
  return token ? { token, appSecret: app.clientSecret } : null;
}

/** What a sign-in's own description names it as reaching. */
type Reach = ReturnType<typeof metaReachOf>;

/**
 * The code traded for the business's token, what Meta says it may do, and which ad accounts and Pages its description
 * names. A refusal where it may not read ads.
 */
async function tokenForAds(
  log: Log,
  app: MetaApp,
  code: string,
): Promise<{ secret: AdSecret; reach: Reach } | Response> {
  const grant = await askMetaAds(log, "exchange", callMetaAds(metaCodeRequest(app, code)), parseMetaToken);
  if (!grant.ok) return refuse(502, "exchange_failed", grant.said);
  const token = grant.value.accessToken;
  const described = await askMetaAds(log, "token", callMetaAds(metaDebugTokenRequest(app, token)), (answer) => ({
    facts: parseMetaDebugToken(answer),
    userId: parseMetaTokenUser(answer),
  }));
  if (!described.ok) return refuse(502, "exchange_failed", described.said);
  const { facts, userId } = described.value;
  if (!facts.valid) return refuse(502, "exchange_failed", "Meta says the token is not valid.");
  if (!facts.scopes.includes("ads_read")) {
    log.info("ads_connect_refused", { at: "scopes" });
    return refuse(403, "scope_missing", "The business did not allow its ads to be read.");
  }
  const business = await askMetaAds(
    log,
    "business",
    callMetaAds(metaBusinessRequest(token, app.clientSecret)),
    parseMetaBusiness,
  );
  const secret: AdSecret = {
    access_token: token,
    expires_at: facts.expiresAt,
    scopes: facts.scopes,
    business_id: business.ok ? business.value : null,
    user_id: userId,
    kept_at: new Date().toISOString(),
  };
  return { secret, reach: metaReachOf(facts.accountsByScope) };
}

/** The number AI answers on WhatsApp in this workspace, or null where it has none. */
async function aiNumberOf(db: Db, tenantId: TenantId): Promise<string | null> {
  const { data } = await findChannelNumber(db, tenantId, "whatsapp");
  return data?.number_e164 ?? null;
}

/** Every ad account a sign-in shared, read, with whether the picked Page's ads have run from it. */
async function accountsSeen(
  log: Log,
  signIn: MetaSignIn,
  accountIds: readonly string[],
  pageId: string | null,
): Promise<AccountSeen[]> {
  const seen: AccountSeen[] = [];
  for (const id of accountIds) {
    const read = await readMetaAccount(log, signIn, id);
    if (!read.ok) continue;
    // Which account a Page's ads run from only matters between two: one account alone is asked nothing more.
    const ran = accountIds.length > 1 && pageId !== null && (await runsPage(log, signIn, read.value.id, pageId));
    seen.push({ account: read.value, runsPage: ran });
  }
  return seen;
}

const choiceOf = ({ account, runsPage: ran }: AccountSeen): AdAccountChoice => ({
  external_id: account.id,
  name: account.name,
  currency: account.currency,
  timezone: account.timezone,
  runs_page: ran,
});

/** The door's answer to what a connect came to. */
function connectAnswer(log: Log, outcome: AdConnectOutcome, accountId: string | null): Response {
  if (outcome === "connected" || outcome === "choosing") {
    log.info("ads_connected", { outcome, account_id: accountId });
    return json(200, { ok: true, outcome, account_id: accountId });
  }
  log.info("ads_connect_refused", { at: "door", outcome });
  if (outcome === "not_allowed") return refuse(403, "ad_account_not_owner");
  if (outcome === "taken") return refuse(409, "ad_account_taken");
  if (outcome === "another_connected") return refuse(409, "ad_account_connected");
  return refuse(503, "not_ready", "The database has not been given the Ads doors yet.");
}

async function connectAds(db: Db, app: MetaApp, by: { tenantId: TenantId; userId: string }, code: string) {
  const log = logger({ tenant_id: by.tenantId });
  const granted = await tokenForAds(log, app, code);
  if (granted instanceof Response) return granted;
  const { secret, reach } = granted;
  const signIn: MetaSignIn = { token: secret.access_token, appSecret: app.clientSecret };
  const accountIds = await sharedIds(log, signIn, reach.accountIds, "accounts");
  if (accountIds.length === 0) {
    log.info("ads_connect_refused", { at: "accounts" });
    return refuse(409, "no_account", "That sign-in shared no ad account.");
  }
  const pages = [];
  for (const id of await sharedIds(log, signIn, reach.pageIds, "pages")) {
    const page = await readMetaPage(log, signIn, id);
    if (page.ok) pages.push(page.value);
  }
  const page = pickPage(pages, await aiNumberOf(db, by.tenantId));
  const picked = pickAccount(await accountsSeen(log, signIn, accountIds, page?.id ?? null));
  if (picked === null) {
    log.info("ads_connect_refused", { at: "accounts", shared: accountIds.length });
    return refuse(409, "no_account", "No ad account that sign-in shared can run ads.");
  }
  const beside = { ...pageConfigOf(page), scopes: secret.scopes, user_id: secret.user_id };
  const one = "one" in picked ? picked.one.account : null;
  const config: MetaAdConfig = {
    ...metaAdConfigOf(null),
    ...beside,
    ...(one ? accountConfigOf(one) : { business_id: secret.business_id }),
    choices: "ask" in picked ? picked.ask.map(choiceOf) : [],
  };
  const connected = await connectAdAccount(db, by, "meta", {
    account: {
      external_id: one?.id ?? null,
      name: one?.name ?? null,
      currency: one?.currency ?? null,
      timezone: one?.timezone ?? null,
      standing: one ? { ...standingOf(one) } : {},
      config: { ...config },
      token_expires_at: secret.expires_at,
    },
    secret: { ...secret },
    chosen: false,
  });
  return connectAnswer(log, connected.outcome, connected.accountId);
}

async function chooseAds(db: Db, app: MetaApp, by: { tenantId: TenantId; userId: string }, externalId: string) {
  const log = logger({ tenant_id: by.tenantId });
  const waiting = await findLiveAdAccount(db, by.tenantId, "meta");
  if (waiting?.status !== "choosing") return refuse(409, "nothing_to_do", "No ad account waits to be chosen.");
  const kept = metaAdConfigOf(waiting.config);
  if (!kept.choices.some((choice) => choice.external_id === externalId))
    return refuse(400, "bad_request", "external_id is not one of the accounts to choose from");
  const secret = await readAdSecret(db, waiting.id);
  const signIn = await signInOf(db, app, waiting.id);
  if (!secret || !signIn) return refuse(409, "no_token", "The sign-in was not kept. Connect again.");
  const read = await readMetaAccount(log, signIn, externalId);
  if (!read.ok) return refuse(502, "meta_refused", read.said);
  const account = read.value;
  const connected = await connectAdAccount(db, by, "meta", {
    account: {
      external_id: account.id,
      name: account.name,
      currency: account.currency,
      timezone: account.timezone,
      standing: { ...standingOf(account) },
      config: { ...kept, ...accountConfigOf(account), choices: [] },
      token_expires_at: waiting.token_expires_at,
    },
    secret: secret as Json,
    chosen: true,
  });
  return connectAnswer(log, connected.outcome, connected.accountId);
}

/** How lately an account was read that it is not asked again: the owner coming back twice in one breath is one look. */
const FRESH_MS = 20_000;

/**
 * Chanlytics looks again at a connected account: the account and its Page as Meta describes them now. Nothing is asked
 * where Meta's pace holds a call back or the last read is seconds old; a sign-in Meta no longer takes marks the account.
 */
export async function lookAgain(db: Db, app: MetaApp, account: AdAccountRow, nowMs: number): Promise<string> {
  const tenantId = account.tenant_id as TenantId;
  const log = logger({ tenant_id: tenantId, account_id: account.id });
  if (account.status !== "connected" || account.external_id === null) return "not_connected";
  if (!mayAskMeta(account, nowMs)) return "waiting";
  if (account.read_at !== null && nowMs - Date.parse(account.read_at) < FRESH_MS) return "fresh";
  const signIn = await signInOf(db, app, account.id);
  if (!signIn) return "not_connected";
  const read = await readMetaAccount(log, signIn, account.external_id);
  if (!read.ok) {
    if (read.fault === "revoked") {
      await markAdAccountRevoked(db, tenantId, account.id, "read");
      log.info("ads_revoked", { how: "read" });
      return "revoked";
    }
    const failed = { error: read.fault, read_after: readAfterOf(read.usage, read.fault, nowMs) };
    await keepAdAccountRead(db, tenantId, account.id, read.usage ? { ...failed, usage_pct: read.usage.pct } : failed);
    return "failed";
  }
  const pageId = metaAdConfigOf(account.config).page_id;
  const page = pageId === null ? null : await readMetaPage(log, signIn, pageId);
  const usage = page?.usage ?? read.usage;
  const outcome = await keepAdAccountRead(db, tenantId, account.id, {
    name: read.value.name,
    timezone: read.value.timezone,
    standing: { ...standingOf(read.value) },
    // A Page Meta would not describe this time keeps what was last known of it.
    config: { ...accountConfigOf(read.value), ...(page?.ok ? pageConfigOf(page.value) : {}) },
    ...(usage ? { usage_pct: usage.pct } : {}),
    read_after: readAfterOf(usage, null, nowMs),
  });
  log.info("ads_account_checked", { outcome });
  return outcome;
}

/** `status`: whether the app's sign-in for ads is held here, whether Ads is offered in this workspace, and the app's public half. */
function adsStatus(tenantId: string, app: MetaApp | null): Response {
  return json(200, {
    ok: true,
    ready: !!app,
    on: adsOfferedIn(tenantId),
    ...(app ? { app: { client_id: app.clientId, config_id: app.configId, redirect_uri: app.redirectUri } } : {}),
  });
}

/** The door's ops: what each answers is in the module's head. */
export async function runAdsAccountOp(auth: Admitted, body: Partial<AdsAccountBody>): Promise<Response> {
  const op = typeof body.op === "string" ? body.op : "";
  const app = metaAdsApp();
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (op === "status") return adsStatus(tenantId, app);
  const userId = personFor(auth, body.user_id) ?? "";
  if (!isTenantId(tenantId) || !UUID.test(userId)) return refuse(400, "bad_request", "tenant_id and user_id required");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  if (!app) return refuse(503, "no_app_credentials");
  if (!adsOfferedIn(tenantId)) return refuse(409, "meta_off", "Ads is not offered in this workspace yet.");
  // The owner alone, asked before anything is asked of Meta (decision 0050, call 2).
  if (!(await mayRunAds(db, tenantId, userId))) return refuse(403, "ad_account_not_owner");
  const by = { tenantId, userId };
  if (op === "connect") {
    const code = String(body.code ?? "").trim();
    if (!code || code.length > 2000) return refuse(400, "bad_request", "code required");
    return connectAds(db, app, by, code);
  }
  if (op === "choose") return chooseAds(db, app, by, String(body.external_id ?? "").trim());
  if (op === "check") {
    const live = await findLiveAdAccount(db, tenantId, "meta");
    return json(200, { ok: true, outcome: live ? await lookAgain(db, app, live, Date.now()) : "not_connected" });
  }
  return refuse(400, "unknown_op", "op is status, connect, choose or check");
}
