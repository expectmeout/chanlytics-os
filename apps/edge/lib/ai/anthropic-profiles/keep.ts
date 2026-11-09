/**
 * The profiles' keeping, run by the health sweep twice an hour (decision 0097). Anthropic's webhook for these events is in
 * beta and delivers nothing yet, so what it says is read off its list, and three things follow:
 *
 *   read    Every profile listed, whole. Each profile's status and open actions written where they changed, and the platform
 *           paged when one is newly acted on or banned. What a listing did not reach stays as it was, so a short listing clears nothing.
 *           An answer that names no status changes nothing. A claim whose answer was lost (older than STALE_CLAIM_MS with no
 *           id) takes the profile the listing finds by its reference, or, once a whole listing finds none, is let go.
 *   delete  A profile whose person or workspace went, whichever way (delete_my_account, delete-tenant, a hand in the
 *           database: 00544's on delete set null), or whose workspace's last member left, deleted at Anthropic and then here.
 *           A delete that fails is tried on the next tick; a 404 means it went. This runs with the switch off too.
 *   make    A few of those with no profile, while the switch is on: anyone active has one by their first call, and a slow
 *           sweep keeps to the rate Anthropic asks of a whole customer base.
 *
 * Never throws: the sweep it rides on watches everything else.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  anthropicActed,
  anthropicPaused,
  enforcementWords,
  MIN_MS,
  SECOND_MS,
  type AnthropicEnforcementStatus,
  type EnforcementAction,
} from "@chanlytics/contracts";
import { deleteUserProfile, listUserProfiles, type AnthropicProfile } from "@chanlytics/channels/ai";
import {
  listAnthropicProfileRows,
  listAnthropicProfilesWaiting,
  dropAnthropicProfile,
  keepAnthropicProfileId,
  setAnthropicEnforcement,
  type AnthropicProfileRow,
} from "@chanlytics/db/ai";
import type { Database } from "@chanlytics/db/types";
import { env } from "../../shared/env.js";
import { errField, logger } from "../../shared/log.js";
import { modelDeps } from "../model.js";
import { pageOperator, type PagePorts } from "../../shared/alerts/page-operator.js";
import { anthropicProfilesOn, makeAnthropicProfile } from "./attribution.js";

/** How old a claim with no id must be before its answer counts as lost: past any create still in flight. */
const STALE_CLAIM_MS = 10 * MIN_MS;
/** The most a tick reads: at a hundred a page, as many profiles as this platform will hold for a long while. */
const LIST_PAGES = 50;
/** Its share of the sweep's minute. What it does not reach, the next tick does. */
const KEEP_MS = 20 * SECOND_MS;
/** How many are made a tick: slow on purpose (Anthropic rate limits creation, and asks to hear of a bulk registration). */
const MADE_A_TICK = 5;

interface ProfilesKept {
  acted: number;
  cleared: number;
  adopted: number;
  deleted: number;
  made: number;
}

const NOTHING_KEPT: ProfilesKept = { acted: 0, cleared: 0, adopted: 0, deleted: 0, made: 0 };

/** What one tick works with: its clients, the end of its share of the sweep's minute, and the counts it moves. */
interface KeepTick {
  db: SupabaseClient<Database>;
  key: string;
  pager: Omit<PagePorts, "db">;
  until: number;
  kept: ProfilesKept;
}

const sweepLog = () => logger({ sweep: "health" });

/** Every profile, as far as the time allows, and whether that was all of them. */
async function listedProfiles({ key, until }: KeepTick): Promise<{ profiles: AnthropicProfile[]; whole: boolean }> {
  const profiles: AnthropicProfile[] = [];
  let page: string | null = null;
  for (let n = 0; n < LIST_PAGES && Date.now() < until; n++) {
    const p = await listUserProfiles(key, page, modelDeps());
    if (!p.ok) {
      sweepLog().error("anthropic_profiles_unlisted", { error: p.error.slice(0, 200) });
      return { profiles, whole: false };
    }
    profiles.push(...p.profiles);
    if (!p.next) return { profiles, whole: true };
    page = p.next;
  }
  return { profiles, whole: false };
}

const sameActions = (a: EnforcementAction[], b: EnforcementAction[]): boolean =>
  JSON.stringify(a.map((x) => x.id).sort()) === JSON.stringify(b.map((x) => x.id).sort());

/** The page for a profile Anthropic has newly acted on: who, what it said, what follows. Never a customer's words. */
function actionWords(
  anthropicProfile: AnthropicProfileRow,
  status: AnthropicEnforcementStatus,
  sentence: string,
): { subject: string; body: string } {
  const person =
    anthropicProfile.kind === "workspace"
      ? `Workspace ${anthropicProfile.tenant_id ?? "gone"}`
      : `Person ${anthropicProfile.user_id ?? "gone"}`;
  const paused = anthropicPaused(status);
  return {
    subject: `Anthropic has ${paused ? "paused" : "limited"} one account's model calls`,
    body:
      `${person} (${anthropicProfile.profile_id ?? "no profile"}). ${sentence}\n` +
      (paused
        ? "Its calls are held here until Anthropic lifts it; "
        : "Its calls still go, and Anthropic refuses what it refuses; ") +
      "every other account goes on. Console › Health › Model calls lists it.\n",
  };
}

/**
 * One row against what the listing said of it. The status is written first: a ban's hold matters more than the page, and a page
 * that cannot be sent is logged, with Health still showing it. A row on its way out is not paged: there is nobody left to help.
 */
async function readProfile(
  keepTick: KeepTick,
  anthropicProfile: AnthropicProfileRow,
  profile: AnthropicProfile,
): Promise<void> {
  if (!profile.status) return;
  if (
    profile.status === anthropicProfile.enforcement_status &&
    sameActions(profile.actions, anthropicProfile.enforcement_actions)
  )
    return;
  await setAnthropicEnforcement(
    keepTick.db,
    anthropicProfile.id,
    profile.status,
    profile.actions,
    new Date().toISOString(),
  );
  if (anthropicActed(anthropicProfile.enforcement_status) && !anthropicActed(profile.status))
    keepTick.kept.cleared += 1;
  const newlyActed = !anthropicActed(anthropicProfile.enforcement_status) && anthropicActed(profile.status);
  const newlyBanned = !anthropicPaused(anthropicProfile.enforcement_status) && anthropicPaused(profile.status);
  if (!newlyActed && !newlyBanned) return;
  keepTick.kept.acted += 1;
  if (anthropicProfile.leaving) return;
  const words = actionWords(anthropicProfile, profile.status, enforcementWords(profile.status, profile.actions));
  const key = `anthropic_profile:${anthropicProfile.id}:${newlyBanned ? "banned" : "acted"}`;
  await pageOperator({ db: keepTick.db, ...keepTick.pager }, key, words.subject, words.body).catch((e: unknown) =>
    sweepLog().error("anthropic_profile_unpageable", { row: anthropicProfile.id, error: errField(e) }),
  );
}

/** What a listing found, by id and by the reference a create named. */
interface Listing {
  byId: Map<string, AnthropicProfile>;
  byReference: Map<string, AnthropicProfile[]>;
  whole: boolean;
}

/** A claim with no id, past any create in flight: the profile the listing finds for it, or the claim let go. */
async function settleClaim(
  keepTick: KeepTick,
  anthropicProfile: AnthropicProfileRow,
  listing: Listing,
): Promise<AnthropicProfileRow | null> {
  const found = [...(listing.byReference.get(anthropicProfile.reference_id) ?? [])].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? ""),
  );
  const first = found[0];
  if (first) {
    if (found.length > 1)
      sweepLog().error("anthropic_profile_twice", {
        row: anthropicProfile.id,
        kept: first.id,
        others: found.slice(1).map((p) => p.id),
      });
    await keepAnthropicProfileId(keepTick.db, anthropicProfile.id, first.id);
    keepTick.kept.adopted += 1;
    return { ...anthropicProfile, profile_id: first.id };
  }
  if (listing.whole) await dropAnthropicProfile(keepTick.db, anthropicProfile.id);
  return null;
}

/** What Anthropic now says, written row by row; the rows as they then stand. */
async function readEnforcement(keepTick: KeepTick, rows: AnthropicProfileRow[]): Promise<AnthropicProfileRow[]> {
  const { profiles, whole } = await listedProfiles(keepTick);
  const listing: Listing = { byId: new Map(profiles.map((p) => [p.id, p])), byReference: new Map(), whole };
  for (const p of profiles)
    if (p.referenceId) listing.byReference.set(p.referenceId, [...(listing.byReference.get(p.referenceId) ?? []), p]);
  const now = Date.now();
  const out: AnthropicProfileRow[] = [];
  for (const row of rows) {
    const stale = !row.profile_id && now - Date.parse(row.claimed_at) >= STALE_CLAIM_MS;
    const r = stale ? await settleClaim(keepTick, row, listing) : row;
    if (!r) continue;
    out.push(r);
    const profile = r.profile_id ? listing.byId.get(r.profile_id) : undefined;
    if (profile) await readProfile(keepTick, r, profile);
  }
  return out;
}

/** The profiles whose subject went: deleted there, then here. A failure waits for the next tick. */
async function deleteLeaving(keepTick: KeepTick, rows: AnthropicProfileRow[]): Promise<void> {
  for (const r of rows) {
    if (!r.leaving || !r.profile_id || Date.now() >= keepTick.until) continue;
    if (await deleteUserProfile(keepTick.key, r.profile_id, modelDeps())) {
      await dropAnthropicProfile(keepTick.db, r.id);
      keepTick.kept.deleted += 1;
    } else {
      sweepLog().error("anthropic_profile_not_deleted", { row: r.id });
    }
  }
}

/** One tick. With no key, or the switch off and no row to keep, it reads nothing of Anthropic's. */
export async function keepAnthropicProfiles(
  db: SupabaseClient<Database>,
  pager: Omit<PagePorts, "db"> = {},
): Promise<ProfilesKept> {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return NOTHING_KEPT;
  const keepTick: KeepTick = { db, key, pager, until: Date.now() + KEEP_MS, kept: { ...NOTHING_KEPT } };
  try {
    const rows = await listAnthropicProfileRows(db);
    if (rows.length) await deleteLeaving(keepTick, await readEnforcement(keepTick, rows));
    if (anthropicProfilesOn())
      for (const subject of await listAnthropicProfilesWaiting(db, MADE_A_TICK)) {
        if (Date.now() >= keepTick.until) break;
        if (await makeAnthropicProfile(db, subject, key, modelDeps())) keepTick.kept.made += 1;
      }
  } catch (e) {
    sweepLog().error("anthropic_profiles_unkept", { error: errField(e) });
  }
  return keepTick.kept;
}
