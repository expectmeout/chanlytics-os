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
import { AppError } from "@chanlytics/contracts";
import { memberContext, requireRole, requireSpend, withRoute, type MemberContext, type RouteContext } from "./with-route";
import { takeRate, type RateBucket } from "./rate-limit";
import { backOffice, type BackOffice } from "./platform";

export type Role = MemberContext["role"];
export type Params = Record<string, string | string[] | undefined>;
export type RouteCtx = RouteContext & { params: Params };

declare const memberBrand: unique symbol;
/**
 * A membership route() resolved and checked. Nothing else can make one, so a
 * helper that takes a Member instead of a bare tenant id cannot be called
 * without the check having happened.
 */
export type Member = Readonly<Pick<MemberContext, "tenantId" | "role">> & { readonly [memberBrand]: true };

export type Scope =
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
export type Given<S extends Scope> =
  S extends { kind: "workspace" } ? { member: Member }
  : S extends { kind: "row" } ? { member: Member; row: RowOf<S> }
  : S extends { kind: "platform" } ? { office: BackOffice }
  : Record<never, never>;
export type Call<S extends Scope, I> = { ctx: RouteCtx; req: Request; input: I } & Given<S>;

export interface Policy {
  readonly kind: "read" | "write";
  readonly scope: Scope["kind"];
  /** On a read, null means every member may read. */
  readonly role: Role | null;
  readonly rate: RateBucket | null;
  readonly spend: boolean;
}

export interface ReadSpec<S extends Scope, Q, O> {
  scope: S;
  /** Every member may read unless this says otherwise. */
  role?: Role;
  rate?: RateBucket | null;
  query?: ZodType<Q>;
  handle: (call: Call<S, Q>) => Promise<O>;
}

export interface WriteSpec<S extends Scope, I, O> {
  scope: S;
  /** Who may change this. null only on the account and platform scopes; route-policy.test holds that. */
  role: Role | null;
  /** A bucket, or null said out loud. Never omitted: the policy file shows every null for review. */
  rate: RateBucket | null;
  spend?: boolean;
  input?: ZodType<I>;
  handle: (call: Call<S, I>) => Promise<O>;
}

const AMBIGUOUS = "This account belongs to more than one workspace — say which one before changing anything.";

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
      const m = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
      // A write must never land in a workspace nobody named. A read, until the
      // client always names one (plan Task 3.4), keeps today's oldest-membership
      // default, which changes nothing.
      if (m.ambiguous && kind === "write") throw new AppError("choose_workspace", AMBIGUOUS);
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
async function bodyOf(req: Request): Promise<unknown> {
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
  throw new AppError("validation", `${said.join(" ")}${more > 0 ? ` (and ${more} more)` : ""}`);
}

interface Spec<S extends Scope, I, O> {
  scope: S;
  role?: Role | null;
  rate?: RateBucket | null;
  spend?: boolean;
  input?: ZodType<I>;
  query?: ZodType<I>;
  handle: (call: Call<S, I>) => Promise<O>;
}

function build<S extends Scope, I, O>(kind: Policy["kind"], spec: Spec<S, I, O>) {
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
      await requireSpend(ctx, member);
    }
    if (spec.rate) await takeRate(ctx.userId, spec.rate);
    const input =
      kind === "write"
        ? spec.input ? parse(spec.input, await bodyOf(req)) : undefined
        : spec.query
          ? parse(spec.query, Object.fromEntries([...new URL(req.url).searchParams].filter(([k]) => k !== "workspace")))
          : undefined;
    return spec.handle({ ctx, req, input, ...given } as unknown as Call<S, I>);
  };

  return Object.assign(withRoute((req, ctx) => run(req, ctx)), { policy, run });
}

/** A GET. */
export function read<S extends Scope, Q = undefined, O = unknown>(spec: ReadSpec<S, Q, O>) {
  return build<S, Q, O>("read", spec);
}

/** A POST, PUT, PATCH or DELETE. */
export function write<S extends Scope, I = undefined, O = unknown>(spec: WriteSpec<S, I, O>) {
  return build<S, I, O>("write", spec);
}
