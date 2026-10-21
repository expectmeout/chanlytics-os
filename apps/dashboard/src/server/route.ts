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
import {
  AppError,
  MIN_MS,
  staffCannotSeeWords,
  staffCannotWords,
  staffMay,
  staffSees,
  type ConsoleAct,
  type ConsoleSight,
  type SpendWords,
} from "@chanlytics/contracts";
import {
  claimIdempotencyKey,
  keepIdempotencyReceipt,
  releaseIdempotencyKey,
  takeIdempotencyKey,
  type Json,
} from "@chanlytics/db";
import {
  memberContext,
  requireFreshSession,
  requireRole,
  requireSpend,
  withRoute,
  type MemberContext,
  type RouteContext,
} from "./with-route";
import { takeRate, type RateBucket } from "./rate-limit";
import { backOffice, type BackOffice } from "./platform/platform";
import { log } from "./log";

type Role = MemberContext["role"];
export type Params = Record<string, string | string[] | undefined>;
type RouteCtx = RouteContext & { params: Params };

declare const memberBrand: unique symbol;
/**
 * A membership route() resolved and checked. Nothing else can make one, so a
 * helper that takes a Member instead of a bare tenant id cannot be called
 * without the check having happened.
 */
export type Member = Readonly<Pick<MemberContext, "tenantId" | "role" | "facts">> & { readonly [memberBrand]: true };

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
  /**
   * Present, and true, on a route whose act is sensitive enough that a session revoked a minute ago must not pass: the
   * Auth server is asked whether it is still live before the handler runs (requireFreshSession). Absent otherwise, so
   * route-policy.json changes only on the routes that declare it.
   */
  readonly fresh?: true;
  readonly scope: Scope["kind"];
  /** On a read, null means every member may read. */
  readonly role: Role | null;
  readonly rate: RateBucket | null;
  readonly spend: boolean;
  /**
   * Present on a write that keeps its own idempotency key (the reply's, kept by core per member, 0004): route() leaves
   * the Idempotency-Key header to it (decision 0035). Absent otherwise, so route-policy.json changes only where declared.
   */
  readonly idempotent?: "own";
  /**
   * Present on a platform write: the Console's act it is (decision 0066), whose roles may take it (contracts
   * CONSOLE_ACTS). Absent otherwise, so route-policy.json changes only on the routes that declare it.
   */
  readonly act?: ConsoleAct;
  /**
   * Present on a platform read that only some roles may make: what it shows (contracts CONSOLE_SIGHTS, decision 0066),
   * whose roles may read it. Absent otherwise: every role reads the workspaces, Health and the Admin log.
   */
  readonly sees?: ConsoleSight;
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
  /** Ask the Auth server whether the session is still live before the handler runs (Policy.fresh). */
  fresh?: boolean;
  /** Every member may read unless this says otherwise. */
  role?: Role;
  /** On a platform read, what it shows that only some roles may read: a role that may not is refused first (Policy.sees). */
  sees?: ConsoleSight;
  rate?: RateBucket | null;
  query?: ZodType<Q>;
  handle: (call: Call<S, Q>) => Promise<O>;
}

interface WriteSpec<S extends Scope, I, O> {
  scope: S;
  /** Ask the Auth server whether the session is still live before the handler runs (Policy.fresh). */
  fresh?: boolean;
  /** Who may change this. null only on the account and platform scopes; route-policy.test holds that. */
  role: Role | null;
  /** A bucket, or null said out loud. Never omitted: the policy file shows every null for review. */
  rate: RateBucket | null;
  spend?: boolean;
  /** What a refusal to spend says the money was for; the default names a number. */
  spendWords?: SpendWords;
  /** "own": this write keeps its Idempotency-Key itself, and route() does not (Policy.idempotent). */
  idempotent?: "own";
  /** On a platform write, the Console's act it is: a role that may not take it is refused first (Policy.act). */
  act?: ConsoleAct;
  input?: ZodType<I>;
  handle: (call: Call<S, I>) => Promise<O>;
}

function mint(m: MemberContext): Member {
  return { tenantId: m.tenantId, role: m.role, ...(m.facts ? { facts: m.facts } : {}) } as Member;
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
function bodyAsJson(text: string): unknown {
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
  fresh?: boolean;
  role?: Role | null;
  rate?: RateBucket | null;
  spend?: boolean;
  spendWords?: SpendWords;
  idempotent?: "own";
  act?: ConsoleAct;
  sees?: ConsoleSight;
  input?: ZodType<I>;
  query?: ZodType<I>;
  handle: (call: Call<S, I>) => Promise<O>;
}

/** A value as the ledger stores it, through its own serialization: no cast says what the compiler cannot see. */
function viaJson<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The most of a key the ledger keeps; a longer one is not a key (a card's proposal id is twenty characters, a uuid 36). */
const KEY_MAX = 120;
/** How long a claim with no receipt is a request still running; past it, its request died and the next one takes over (core's reply key holds the same two minutes). */
const HOLD_MS = 2 * MIN_MS;

/** A request as its key holds it: its method, its path and its body, hashed, so one key is never two requests. */
async function requestHashOf(req: Request, body: string): Promise<string> {
  const said = new TextEncoder().encode(`${req.method} ${new URL(req.url).pathname}\n${body}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", said));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A write, answered once per key (decision 0035). A request that carries an Idempotency-Key claims it on
 * idempotency_keys before the write runs, under `req:` with the hash of the request, so the same request sent again
 * (a timeout pressed twice, a tab that retried) is given the first answer and changes nothing; the same key on another
 * request is refused, 422, since a client that reuses a key for a second intent would otherwise be told the first
 * one's answer. An Ask card's write keeps its own prefix, `card:`, and no hash: a card approved from two tabs is one
 * write whatever each tab sent (the scorecard, 29 September: "a broadcast or playbook card approved in two tabs runs
 * twice"; legacy-bridge/ask commit.ts names the proposal id as the key and says it is Ask's). A request that arrives
 * while the first still runs is refused in words; a write that fails lets the key go, so pressing again tries again; a
 * request that died holding it (killed mid-write, its receipt never kept) is taken over by the next once HOLD_MS has
 * passed, as core's reply key is, so a key never sticks. A route that keeps its own key (the reply, `idempotent:
 * "own"`), a request with no key or one too long to be a key, and a write with no workspace to keep it in (an account's
 * or the platform's) run as they always have. Every key is kept a day (purge_idempotency_keys, 00340).
 */
async function onceForKey<O>(
  ctx: RouteCtx,
  member: Pick<MemberContext, "tenantId"> | null,
  req: Request,
  own: boolean,
  bodyOf: () => Promise<string>,
  run: () => Promise<O>,
): Promise<O> {
  const raw = (req.headers.get("idempotency-key") ?? "").trim();
  if (!member || own || !raw || raw.length > KEY_MAX) return run();
  const card = req.headers.get("x-via") === "ask";
  const tenantId = member.tenantId;
  const key = `${card ? "card" : "req"}:${raw}`;
  const requestHash = card ? "" : await requestHashOf(req, await bodyOf());
  const nowIso = new Date().toISOString();
  const route = `${req.method} ${new URL(req.url).pathname}`.slice(0, 200);
  const claim = await claimIdempotencyKey(ctx.supabase, { tenantId, key, route, requestHash, nowIso });
  if (!claim.won) {
    const held = claim.held;
    if (held && (held.request_hash ?? "") !== requestHash) {
      throw new AppError(
        "conflict",
        "This request's key was used for another request. Send it again as a new one.",
        422,
      );
    }
    if (held?.response) return viaJson<O>(held.response);
    // Taken by the stamp it was read at, so of two requests that both read an abandoned claim exactly one takes it.
    const abandoned = held !== null && Date.now() - Date.parse(held.created_at) >= HOLD_MS;
    const taken =
      abandoned && held
        ? await takeIdempotencyKey(ctx.supabase, { tenantId, key, requestHash, nowIso, from: held.created_at })
        : false;
    if (!taken) {
      throw new AppError(
        "conflict",
        card
          ? "This card is being approved already. Its answer arrives in a moment."
          : "This is being done already. Its answer arrives in a moment.",
      );
    }
  }
  let out: O;
  try {
    out = await run();
  } catch (e) {
    await releaseIdempotencyKey(ctx.supabase, { tenantId, key, nowIso }).catch(() => {});
    throw e;
  }
  const response = viaJson<Json>(out === undefined ? { ok: true } : out);
  // The write has happened; a receipt that cannot be kept means a second request runs it again after the hold's window,
  // so it is said, not swallowed. A key another request took over is not the receipt's to write, and says the same.
  const unkept = (error: unknown) =>
    card
      ? log.error("card_receipt_unkept", { tenant_id: tenantId, error })
      : log.error("write_receipt_unkept", { tenant_id: tenantId, error });
  const kept = await keepIdempotencyReceipt(ctx.supabase, {
    tenantId,
    key,
    requestHash,
    response,
    stamp: nowIso,
  }).catch((e: unknown) => {
    unkept(e);
    return true;
  });
  if (!kept) unkept("the key was taken over");
  return out;
}

function buildRoute<S extends Scope, I, O>(kind: Policy["kind"], spec: Spec<S, I, O>) {
  const policy: Policy = Object.freeze({
    kind,
    ...(spec.fresh ? { fresh: true as const } : {}),
    scope: spec.scope.kind,
    role: spec.role ?? null,
    rate: spec.rate ?? null,
    spend: spec.spend === true,
    ...(spec.idempotent ? { idempotent: spec.idempotent } : {}),
    ...(spec.act ? { act: spec.act } : {}),
    ...(spec.sees ? { sees: spec.sees } : {}),
  });

  const run = async (req: Request, ctx: RouteCtx): Promise<O> => {
    const { member, given } = await resolve(spec.scope, kind, req, ctx);
    if (spec.fresh) await requireFreshSession(ctx);
    if (spec.role) {
      if (!member) throw new Error(`a ${spec.scope.kind}-scoped route cannot require a role`);
      requireRole(member, spec.role);
    }
    // A Console act a role may not take is refused before a token is spent or the body is judged, as a role is.
    if (spec.act) {
      const office = (given as { office?: BackOffice }).office;
      if (!office) throw new Error(`a ${spec.scope.kind}-scoped route cannot name a Console act`);
      if (!staffMay(office.role, spec.act))
        throw new AppError("forbidden", staffCannotWords(office.role, spec.act), 403);
    }
    // So is a read of what a role may not see, before anything is read.
    if (spec.sees) {
      const office = (given as { office?: BackOffice }).office;
      if (!office) throw new Error(`a ${spec.scope.kind}-scoped route cannot name a Console sight`);
      if (!staffSees(office.role, spec.sees))
        throw new AppError("forbidden", staffCannotSeeWords(office.role, spec.sees), 403);
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
    // A write's body is read once, as text: its schema parses it and its key hashes it. A write with no schema leaves
    // the body to its handler (an upload reads its own form), so its key hashes a copy, and only when one is sent.
    let body: string | null = null;
    const input =
      kind === "write"
        ? spec.input
          ? parse(spec.input, bodyAsJson((body = await req.text())))
          : undefined
        : spec.query
          ? parse(spec.query, Object.fromEntries([...new URL(req.url).searchParams].filter(([k]) => k !== "workspace")))
          : undefined;
    const handle = () => spec.handle({ ctx, req, input, ...given } as unknown as Call<S, I>);
    const bodyOf = async () => body ?? (await req.clone().text());
    return kind === "write" ? onceForKey(ctx, member, req, spec.idempotent === "own", bodyOf, handle) : handle();
  };

  // `input` is what the route declared it takes (a write's body, a read's query): the /api/v1 reference is written
  // from it (tooling/scripts/gen/api-reference.mjs, docs/api.md), as route-policy.json is from `policy`.
  const handler = Object.assign(
    withRoute((req, ctx) => run(req, ctx)),
    { policy, run, input: kind === "write" ? spec.input : spec.query },
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
