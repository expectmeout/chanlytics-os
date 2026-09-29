/**
 * Every /api/v1 route declares its policy here, and one pipeline enforces it.
 *
 * Before this each handler performed its own: it read `?workspace=` itself (74
 * of them), called the role check, took a rate token, checked billing and
 * picked its body apart, in that order when its author remembered the order.
 * Nothing said which writes skipped a rate limit on purpose, three single-row
 * routes answered "which workspace" three different ways, and no handler could
 * be run in a test, so 121 source reads pinned their text instead.
 *
 * A route now says five things and does none of them:
 *
 *   scope   which workspace it acts on: the one this tab named (`workspace`),
 *           the row's own (`row(load)`), none (`account`), or every one, for
 *           platform staff (`platform`)
 *   role    who may do it (a read with none is open to every member)
 *   rate    the bucket it counts against, or null said out loud
 *   spend   whether it may cost Chanlytics money
 *   input   the zod schema its body (or, for a read, its query) must pass
 *
 * The order is part of the contract: a viewer is refused before a token is
 * spent, so is a workspace that may not spend, and all of that before the
 * body is judged, so a 403 or a 402 never hides behind a 429 and a malformed
 * request from someone who may not act learns nothing.
 *
 * The exported handler carries its `policy`, which route-policy.test.mjs
 * compares with route-policy.json, and `run(req, ctx)`: everything after the
 * session, which is what a test calls with a database in memory. withRoute
 * keeps the transport it always had: same-origin, the verified session, the
 * envelope, `private, no-store`.
 *
 * Relative imports only, like with-route.ts: this module decides who may do
 * what, so it must load in a test without the build tool's aliases.
 */
import type { ZodType } from "zod";
import { AppError, type SpendWords } from "@chanlytics/contracts";
import { claimIdempotencyKey, keepIdempotencyReceipt, releaseIdempotencyKey, type Json } from "@chanlytics/db";
import {
  memberContext,
  requireRole,
  requireSpend,
  withRoute,
  type MemberContext,
  type RouteContext,
} from "./with-route";
import { takeRate, type RateBucket } from "./rate-limit";
import { backOffice, type BackOffice } from "./platform/platform";

type Role = MemberContext["role"];
export type Params = Record<string, string | string[] | undefined>;
type RouteCtx = RouteContext & { params: Params };

declare const memberBrand: unique symbol;
/**
 * A membership route() resolved and checked. Nothing else can make one, so a
 * helper that takes a Member instead of a bare tenant id cannot be called
 * without the check having happened.
 */
export type Member = Readonly<Pick<MemberContext, "tenantId" | "role">> & { readonly [memberBrand]: true };

type Scope =
  | { readonly kind: "workspace" }
  | { readonly kind: "row"; readonly load: (ctx: RouteContext, params: Params) => Promise<{ tenant_id: string }> }
  | { readonly kind: "account" }
  | { readonly kind: "platform" };

/** The workspace this tab named with `?workspace=`. */
export const workspace = { kind: "workspace" } as const;
/** Account-wide: your name, your workspaces, a new one. No workspace is resolved. */
export const account = { kind: "account" } as const;
/** Every workspace, for platform staff: the database decides who that is (backOffice). */
export const platform = { kind: "platform" } as const;
/**
 * The row's own workspace. The loader reads under RLS, so a row the caller
 * cannot see is a 404; the role is then judged where the row lives, which for
 * a member of two workspaces is the one that matters.
 */
export function row<R extends { tenant_id: string }>(load: (ctx: RouteContext, params: Params) => Promise<R>) {
  return { kind: "row", load } as const;
}

type RowOf<S> = S extends { readonly load: (ctx: RouteContext, params: Params) => Promise<infer R> } ? R : never;
type Given<S extends Scope> = S extends { kind: "workspace" }
  ? { member: Member }
  : S extends { kind: "row" }
    ? { member: Member; row: RowOf<S> }
    : S extends { kind: "platform" }
      ? { office: BackOffice }
      : Record<never, never>;
type Call<S extends Scope, I> = { ctx: RouteCtx; req: Request; input: I } & Given<S>;

interface Policy {
  readonly kind: "read" | "write";
  readonly scope: Scope["kind"];
  /** On a read, null means every member may read. */
  readonly role: Role | null;
  readonly rate: RateBucket | null;
  readonly spend: boolean;
}

declare const shape: unique symbol;
/**
 * What a route takes and answers, carried on the export as a phantom type so
 * the client can read them: `InputOf<typeof POST>` is the body (or, for a
 * read, the query) the schema accepts; `OutputOf<typeof GET>` is what
 * `handle` returns. Nothing exists at runtime: the symbol is never created,
 * and the property is optional so the handler object is unchanged.
 */
export type Shape<I, O> = { readonly [shape]?: { input: I; output: O } };
export type InputOf<R> = R extends Shape<infer I, unknown> ? I : never;
export type OutputOf<R> = R extends Shape<unknown, infer O> ? O : never;

interface ReadSpec<S extends Scope, Q, O> {
  scope: S;
  /** Every member may read unless this says otherwise. */
  role?: Role;
  rate?: RateBucket | null;
  query?: ZodType<Q>;
  handle: (call: Call<S, Q>) => Promise<O>;
}

interface WriteSpec<S extends Scope, I, O> {
  scope: S;
  /** Who may change this. null only on the account and platform scopes; route-policy.test holds that. */
  role: Role | null;
  /** A bucket, or null said out loud. Never omitted: the policy file shows every null for review. */
  rate: RateBucket | null;
  spend?: boolean;
  /** What a refusal to spend says the money was for; the default names a number. */
  spendWords?: SpendWords;
  input?: ZodType<I>;
  handle: (call: Call<S, I>) => Promise<O>;
}

function mint(m: MemberContext): Member {
  return { tenantId: m.tenantId, role: m.role } as Member;
}

async function resolve(
  scope: Scope,
  kind: Policy["kind"],
  req: Request,
  ctx: RouteCtx,
): Promise<{ member: MemberContext | null; given: Record<string, unknown> }> {
  switch (scope.kind) {
    case "workspace": {
      // The tab names its workspace with ?workspace=; an account in two that
      // named neither is refused here, read or write (memberContext, plan 3.4).
      const m = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
      return { member: m, given: { member: mint(m) } };
    }
    case "row": {
      const found = await scope.load(ctx, ctx.params);
      const m = await memberContext(ctx, found.tenant_id);
      return { member: m, given: { member: mint(m), row: found } };
    }
    case "platform":
      return { member: null, given: { office: await backOffice(ctx) } };
    case "account":
      return { member: null, given: {} };
  }
}

/** An empty body is `{}`, so a schema whose fields are all optional still passes; an unreadable one is refused. */
async function requestBodyOf(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("validation", "Expected a JSON body.");
  }
}

/** Which field, and all of them, up to three: the settings route's format, now everyone's. */
function parse<T>(schema: ZodType<T>, raw: unknown): T {
  const out = schema.safeParse(raw);
  if (out.success) return out.data;
  const said = out.error.issues.slice(0, 3).map((i) => {
    const field = i.path.filter((p) => typeof p === "string").join(".");
    return field ? `${field}: ${i.message}` : i.message;
  });
  const more = out.error.issues.length - said.length;
  // Every field it refuses, by name, with its first sentence: a form marks the box each belongs to.
  const fields: Record<string, string> = {};
  for (const i of out.error.issues) {
    const field = i.path.filter((p) => typeof p === "string").join(".");
    if (field && !Object.prototype.hasOwnProperty.call(fields, field)) fields[field] = i.message;
  }
  throw new AppError(
    "validation",
    `${said.join(" ")}${more > 0 ? ` (and ${more} more)` : ""}`,
    400,
    Object.keys(fields).length ? { fields } : undefined,
  );
}

interface Spec<S extends Scope, I, O> {
  scope: S;
  role?: Role | null;
  rate?: RateBucket | null;
  spend?: boolean;
  spendWords?: SpendWords;
  input?: ZodType<I>;
  query?: ZodType<I>;
  handle: (call: Call<S, I>) => Promise<O>;
}

/** The most of a card's key the ledger keeps; a longer one is not a card's (a proposal id is twenty characters). */
const CARD_KEY_MAX = 120;

/**
 * An Ask card's write, once (the scorecard, 29 September: "a broadcast or playbook card approved in two tabs runs
 * twice"). A card's commit names its proposal id as its idempotency key and says it is Ask's (legacy-bridge/ask
 * commit.ts); the first press claims the key on idempotency_keys, under the prefix `card:` so a route's own use of the
 * same key (a reply's, core's) is apart, and keeps its answer there. A second press, from any tab, is given that answer
 * and changes nothing; one that arrives while the first is still running is refused in words. A write that fails lets
 * the key go, so pressing again tries again. Any other request runs as it always has.
 */
async function onceForCard<O>(
  ctx: RouteCtx,
  member: Pick<MemberContext, "tenantId"> | null,
  req: Request,
  run: () => Promise<O>,
): Promise<O> {
  const raw = (req.headers.get("idempotency-key") ?? "").trim();
  if (!member || req.headers.get("x-via") !== "ask" || !raw || raw.length > CARD_KEY_MAX) return run();
  const tenantId = member.tenantId;
  const key = `card:${raw}`;
  const nowIso = new Date().toISOString();
  const route = `${req.method} ${new URL(req.url).pathname}`.slice(0, 200);
  const claim = await claimIdempotencyKey(ctx.supabase, { tenantId, key, route, requestHash: "", nowIso });
  if (!claim.won) {
    if (claim.held?.response) return claim.held.response as unknown as O;
    throw new AppError("conflict", "This card is being approved already. Its answer arrives in a moment.");
  }
  let out: O;
  try {
    out = await run();
  } catch (e) {
    await releaseIdempotencyKey(ctx.supabase, { tenantId, key, nowIso }).catch(() => {});
    throw e;
  }
  const response = (out === undefined ? { ok: true } : out) as unknown as Json;
  await keepIdempotencyReceipt(ctx.supabase, { tenantId, key, requestHash: "", response, stamp: nowIso }).catch(
    () => {},
  );
  return out;
}

function buildRoute<S extends Scope, I, O>(kind: Policy["kind"], spec: Spec<S, I, O>) {
  const policy: Policy = Object.freeze({
    kind,
    scope: spec.scope.kind,
    role: spec.role ?? null,
    rate: spec.rate ?? null,
    spend: spec.spend === true,
  });

  const run = async (req: Request, ctx: RouteCtx): Promise<O> => {
    const { member, given } = await resolve(spec.scope, kind, req, ctx);
    if (spec.role) {
      if (!member) throw new Error(`a ${spec.scope.kind}-scoped route cannot require a role`);
      requireRole(member, spec.role);
    }
    // A workspace that may not spend is refused before a token is spent on a
    // request that cannot proceed: a 402 must not turn into a 429 on retry.
    if (spec.spend) {
      if (!member) throw new Error(`a ${spec.scope.kind}-scoped route cannot spend a workspace's money`);
      await requireSpend(ctx, member, spec.spendWords);
    }
    // A route that spends takes its count strictly: the shared count, or a
    // refusal -- never a per-instance count a burst across instances walks past.
    if (spec.rate) await takeRate(ctx.userId, spec.rate, undefined, spec.spend === true);
    const input =
      kind === "write"
        ? spec.input
          ? parse(spec.input, await requestBodyOf(req))
          : undefined
        : spec.query
          ? parse(spec.query, Object.fromEntries([...new URL(req.url).searchParams].filter(([k]) => k !== "workspace")))
          : undefined;
    const handle = () => spec.handle({ ctx, req, input, ...given } as unknown as Call<S, I>);
    return kind === "write" ? onceForCard(ctx, member, req, handle) : handle();
  };

  const handler = Object.assign(
    withRoute((req, ctx) => run(req, ctx)),
    { policy, run },
  );
  return handler as typeof handler & Shape<I, O>;
}

/** A GET. */
export function read<S extends Scope, Q = undefined, O = unknown>(spec: ReadSpec<S, Q, O>) {
  return buildRoute<S, Q, O>("read", spec);
}

/** A POST, PUT, PATCH or DELETE. */
export function write<S extends Scope, I = undefined, O = unknown>(spec: WriteSpec<S, I, O>) {
  return buildRoute<S, I, O>("write", spec);
}
