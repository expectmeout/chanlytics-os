/**
 * The Instagram token sweep (decision 0001, step 8): pg_cron asks once a day ('instagram-token-sweep', 00486) through
 * trigger_instagram_token_sweep, which calls the edge only while an active Instagram account exists.
 *
 * A business's Instagram token lives sixty days unless it is refreshed, and Meta refreshes one only once it is a day old
 * and before it has lapsed. Each active account whose token was given or refreshed a week ago or more (REFRESH_AFTER_MS)
 * is refreshed, and the new token put in the Vault through the one function that writes a credential; its clock is kept
 * on the row's config (token_refreshed_at, token_expires_at), so Connections can say when it lapses. A refresh Meta
 * refuses for the token itself (it lapsed, the business removed the app, its password changed) cannot be mended by asking
 * again: the row says token_lapsed_at, and the workspace is told once, by name, to connect the account again. A refresh
 * that got no answer is left for tomorrow, well inside the sixty days. A token a week old is refreshed on the first day
 * after its week; missing a day costs nothing.
 *
 * An account connected through Meta (the Meta link, `login: "meta"` in its secret) holds the business's own token, which
 * does not lapse on a clock: it is checked, not refreshed. `debug_token` says whether it still stands and what it may do;
 * one Meta no longer takes is said exactly as a lapsed Instagram token is, and what it may do is kept on the row as
 * `scopes`, from which Connections draws its five lines (contracts metaLinesOf), so a permission taken back turns its line
 * Off. A check that got no answer changes nothing and waits for tomorrow.
 *
 * The work is bounded by time: no refresh starts after YIELD_AT_MS from the door's first line, and what is left is first
 * in line tomorrow (the oldest rows first). It answers 200 with the counts whatever Meta said, and 503 only when the
 * accounts cannot be read. Its lines carry `sweep: "instagram_tokens"`, and the tick ends in one ig_tokens_swept.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY_MS, recordOrEmpty } from "@chanlytics/contracts";
import {
  callInstagram,
  instagramErrorOf,
  instagramRefreshRequest,
  metaDebugTokenRequest,
  parseInstagramToken,
  parseMetaDebugToken,
} from "@chanlytics/channels/instagram";
import {
  listActiveInstagramAccounts,
  noteInstagramToken,
  putChannelSecret,
  type InstagramAccountRow,
} from "@chanlytics/db/channels";
import type { Database } from "@chanlytics/db/types";
import { json, refuse } from "../shared/http.js";
import { errField, type Logger } from "../shared/log.js";
import { loadTenantNotifications } from "../shared/tenant-runtime.js";
import { notifyOnce } from "../shared/alerts/notify.js";
import { env } from "../shared/env.js";
import { metaAppId } from "../whatsapp/meta-graph.js";
import type { SweepTick } from "../ops/sweep-door.js";
import { readKeptSecret, type InstagramSecret } from "./credentials.js";

type Db = SupabaseClient<Database>;

/** A token this old is refreshed: Meta's floor is a day, its life sixty, so a week keeps fifty-three days in hand. */
const REFRESH_AFTER_MS = 7 * DAY_MS;
/** No refresh starts after this, counted from the door's first line: each is one call, bounded under ten seconds. */
const YIELD_AT_MS = 40_000;

/** What became of one account this round. */
type Swept = "refreshed" | "checked" | "fresh" | "lapsed" | "unanswered" | "no_token" | "unreadable";

/** Graph's refusal of the token itself: it lapsed, was revoked, or its session ended (190, and its own words for 400s). */
const tokenRefused = (status: number, code: number | null): boolean => code === 190 || status === 401;

/** The workspace told once that its account must be connected again: its row is the Connections row's to say too. */
async function tellLapsed(db: Db, row: InstagramAccountRow, log: Logger): Promise<void> {
  const config = recordOrEmpty(row.config);
  const handle =
    typeof config.username === "string" && config.username ? `@${config.username}` : "Your Instagram account";
  const target = await loadTenantNotifications(db, row.tenant_id);
  await notifyOnce(
    {
      tenantId: row.tenant_id,
      notifications: target.notifications,
      isEnvDefault: target.isEnvDefault,
      slug: target.slug,
    },
    {
      kind: "alert",
      route: "settings/connections",
      about: { type: "channel", id: row.id },
      subject: `${handle} needs to be connected again`,
      body: `Instagram stopped accepting Chanlytics' connection to ${handle}, so its DMs are not being answered. Connect it again from Settings › Connections.`,
      redactedBody: "A workspace's Instagram connection lapsed, and nobody could be told.",
      onceKey: `instagram-lapsed:${row.id}`,
    },
  ).catch((e: unknown) => log.error("ig_token_lapse_untold", { channel_id: row.id, error: errField(e) }));
}

/** A token Meta no longer takes: the row says so, and the workspace is told once. */
async function markLapsed(db: Db, row: InstagramAccountRow, now: number, log: Logger): Promise<"lapsed"> {
  await noteInstagramToken(db, row.id, row.config, { token_lapsed_at: new Date(now).toISOString() });
  await tellLapsed(db, row, log);
  return "lapsed";
}

/** An account connected through Meta: its token asked about, and what it may do kept on the row. */
async function checkMeta(
  db: Db,
  row: InstagramAccountRow,
  at: { token: string; now: number },
  log: Logger,
): Promise<Swept> {
  const { token, now } = at;
  const clientSecret = env.META_APP_SECRET;
  if (!clientSecret) {
    log.warn("ig_token_unchecked", { channel_id: row.id, why: "no_app_secret" });
    return "unanswered";
  }
  const result = await callInstagram(metaDebugTokenRequest({ clientId: metaAppId(), clientSecret }, token));
  let facts: ReturnType<typeof parseMetaDebugToken> | null = null;
  if (result.outcome === "ok") {
    try {
      facts = parseMetaDebugToken(result.json);
    } catch {
      // An answer that says nothing readable about the token is no answer: nothing changes, and tomorrow asks again.
      facts = null;
    }
  }
  if (!facts) {
    log.warn("ig_token_unchecked", { channel_id: row.id, status: result.status, error: result.error });
    return "unanswered";
  }
  if (!facts.valid) {
    log.warn("ig_token_lapsed", { channel_id: row.id, login: "meta" });
    return markLapsed(db, row, now, log);
  }
  const before = recordOrEmpty(row.config).scopes;
  const had = Array.isArray(before) ? before.filter((x): x is string => typeof x === "string") : [];
  const lost = had.filter((p) => !facts.scopes.includes(p));
  if (lost.length) log.warn("ig_token_scopes_changed", { channel_id: row.id, lost });
  await noteInstagramToken(db, row.id, row.config, {
    token_checked_at: new Date(now).toISOString(),
    scopes: facts.scopes,
    token_lapsed_at: null,
  });
  return "checked";
}

/** One account: refreshed when its token is a week old, kept as it was when younger, said when Meta refused it. */
async function sweepOne(db: Db, row: InstagramAccountRow, now: number, log: Logger): Promise<Swept> {
  let secret: Partial<InstagramSecret> | null;
  try {
    secret = row.credentials_ref ? await readKeptSecret(db, row.id) : null;
  } catch (e) {
    log.error("ig_credentials_unreadable", { channel_id: row.id, error: errField(e) });
    return "unreadable";
  }
  if (!secret?.access_token || !secret.account_id) return "no_token";
  if (secret.login === "meta") return checkMeta(db, row, { token: secret.access_token, now }, log);
  const given = Date.parse(secret.refreshed_at ?? "");
  if (Number.isFinite(given) && now - given < REFRESH_AFTER_MS) return "fresh";
  const result = await callInstagram(instagramRefreshRequest(secret.access_token));
  if (result.outcome !== "ok") {
    const err = instagramErrorOf(result.json);
    if (tokenRefused(result.status, err?.code ?? null)) {
      log.warn("ig_token_lapsed", { channel_id: row.id, status: result.status, code: err?.code ?? null });
      return markLapsed(db, row, now, log);
    }
    log.warn("ig_token_unrefreshed", { channel_id: row.id, status: result.status, error: result.error });
    return "unanswered";
  }
  const fresh = parseInstagramToken(result.json);
  const at = new Date(now).toISOString();
  const expiresAt = fresh.expiresInS > 0 ? new Date(now + fresh.expiresInS * 1000).toISOString() : null;
  await putChannelSecret(db, row.id, {
    access_token: fresh.accessToken,
    account_id: secret.account_id,
    expires_at: expiresAt,
    refreshed_at: at,
  });
  await noteInstagramToken(db, row.id, row.config, {
    token_refreshed_at: at,
    token_expires_at: expiresAt,
    token_lapsed_at: null,
  });
  return "refreshed";
}

export async function sweepInstagramTokens(
  { db, L, started }: SweepTick,
  now: () => number = Date.now,
): Promise<Response> {
  let rows: InstagramAccountRow[];
  try {
    rows = await listActiveInstagramAccounts(db);
  } catch (e) {
    L.error("ig_tokens_unreadable", { error: errField(e) });
    return refuse(503, "no_database");
  }
  const counts: Record<Swept | "left", number> = {
    refreshed: 0,
    checked: 0,
    fresh: 0,
    lapsed: 0,
    unanswered: 0,
    no_token: 0,
    unreadable: 0,
    left: 0,
  };
  for (const row of rows) {
    if (now() - started > YIELD_AT_MS) {
      counts.left += 1;
      continue;
    }
    try {
      counts[await sweepOne(db, row, now(), L)] += 1;
    } catch (e) {
      // A write that failed after Meta answered: the old token stands until it lapses, and tomorrow tries again.
      L.error("ig_token_keep_failed", { channel_id: row.id, error: errField(e) });
      counts.unreadable += 1;
    }
  }
  L.info("ig_tokens_swept", { accounts: rows.length, ...counts });
  return json(200, { ok: true, accounts: rows.length, ...counts });
}
