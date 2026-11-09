import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStaffState } from "@chanlytics/db/console";
import type { Database } from "@chanlytics/db/types";
import {
  AppError,
  SECOND_FACTOR_WORDS,
  STAFF_STATES,
  type StaffRole,
  type StaffState,
  isOneOf,
} from "@chanlytics/contracts";
import type { RouteContext } from "./with-route";
import { serviceDb } from "./service-db";

declare const backOfficeBrand: unique symbol;

/**
 * Proof that the database said this session is on the Console's staff and showed its second factor, carrying the
 * client that proof unlocks and who it is. Only `backOffice()` can make one.
 */
export interface BackOffice {
  readonly [backOfficeBrand]: true;
  /** Service-role, RLS off, every workspace. Reachable only through the check above it. */
  readonly db: SupabaseClient<Database>;
  /** The session client, for the reads whose own RPC carries the same check. */
  readonly session: SupabaseClient<Database>;
  /** What the database says they may do (decision 0066): owner, support or billing. */
  readonly role: StaffRole;
  /** Who: the act log's actor. */
  readonly userId: string;
  readonly email: string | null;
}

/**
 * Ask the database what this session is to the Console (platform_staff_state, 00467): its role once it showed its
 * second factor, `needs_second_factor` before, `none` for everybody else.
 *
 * Three answers, not two, and the third is the one that was wrong: a database that cannot answer is not a "no".
 * Telling a real admin "No such page" during a Postgres hiccup is exactly the moment they opened the Console for.
 */
async function staffState(ctx: RouteContext): Promise<StaffState> {
  const { data, error } = await getStaffState(ctx.supabase);
  if (error) throw new AppError("unavailable", "Could not check that just now — try again in a moment.");
  return isOneOf(STAFF_STATES, String(data)) ? (data as StaffState) : "none";
}

/**
 * The Console, or a refusal.
 *
 * 404, not 403: a customer who guessed the URL learns nothing about whether there is a Console behind it. Staff who
 * have not shown their second factor this session are told so (mfa_required), and the tab goes to the second step,
 * which sets an authenticator up for an account that has none (decision 0066: no grace).
 */
export async function getBackOffice(ctx: RouteContext): Promise<BackOffice> {
  const state = await staffState(ctx);
  if (state === "none") throw new AppError("not_found", "No such page.", 404);
  if (state === "needs_second_factor") throw new AppError("mfa_required", SECOND_FACTOR_WORDS.staffRequired, 403);
  const office = { db: serviceDb(), session: ctx.supabase, role: state, userId: ctx.userId, email: ctx.email ?? null };
  // The handle is made here alone (its brand): a route that has none was never let in.
  return office as BackOffice;
}

/**
 * Whether this session is on the Console's staff, its second factor shown or not: the bit the boot hands the nav, so
 * Settings links to the Console, which asks for the factor itself.
 */
export async function isPlatformAdmin(ctx: RouteContext): Promise<boolean> {
  return staffState(ctx).then(
    (state) => state !== "none",
    () => false,
  );
}
