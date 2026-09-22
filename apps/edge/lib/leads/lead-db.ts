/**
 * The lead finder's database half (core LeadDb), over the service client: one
 * method per service RPC of migration 00140, and the reads the runner needs.
 * Every read names the workspace it is for; a read that fails throws with what
 * it was reading, because a failed read is not an answer (the ledger's rule).
 * Nothing here decides anything: the rules are in core and in SQL.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../packages/db.js";
import {
  leadSuppressionHash,
  type LeadRoundEnding,
  type LeadRunState,
  type LeadSearchPlan,
} from "../packages/contracts.js";
import type {
  CollectCommitResult,
  CollectPage,
  LeadDb,
  LeadMemberRow,
  LeadRoundRow,
  LeadRunRow,
  LeadShare,
} from "../packages/core.js";

type Db = SupabaseClient<Database>;
type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

function must<T>(what: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

type RunRow = Database["public"]["Tables"]["lead_runs"]["Row"];
const runOf = (r: RunRow): LeadRunRow => ({
  ...r,
  purpose: r.purpose as LeadRunRow["purpose"],
  state: r.state as LeadRunState,
  cap_usd: r.cap_usd === null ? null : Number(r.cap_usd),
  usage_usd: Number(r.usage_usd),
});

export function leadDb(db: Db): LeadDb {
  // The generated types name each function; the argument object is the function's own.
  // Called ON the client and never lifted off it: SupabaseClient.rpc reads `this.rest`,
  // so a detached `db.rpc` throws against a real client (gate G3).
  const rpc: Rpc = (fn, args) => (db as unknown as { rpc: Rpc }).rpc(fn, args);
  const bool = async (name: string, args: Record<string, unknown>): Promise<boolean> =>
    must<unknown>(name, await rpc(name, args)) === true;
  const json = async <T>(name: string, args: Record<string, unknown>): Promise<T> =>
    must<T>(name, (await rpc(name, args)) as { data: T | null; error: { message: string } | null });
  return {
    runClaim: (runId, owner) => bool("lead_run_claim", { p_run_id: runId, p_owner: owner }),
    runRecordStart: (runId, owner, apifyRunId, datasetId, capUsd) =>
      bool("lead_run_record_start", {
        p_run_id: runId,
        p_owner: owner,
        p_apify_run_id: apifyRunId,
        p_dataset_id: datasetId,
        p_cap_usd: capUsd,
      }),
    runMarkUnknown: (runId, owner) => bool("lead_run_mark_unknown", { p_run_id: runId, p_owner: owner }),
    runReconcile: (runId, apifyRunId, datasetId, state) =>
      bool("lead_run_reconcile", {
        p_run_id: runId,
        p_apify_run_id: apifyRunId,
        p_dataset_id: datasetId,
        p_state: state,
      }),
    async runLease(runId, owner, seconds) {
      const v = await json<unknown>("lead_run_lease", { p_run_id: runId, p_owner: owner, p_seconds: seconds });
      return typeof v === "number" ? v : null;
    },
    runRelease: (runId, owner, gen) => bool("lead_run_release", { p_run_id: runId, p_owner: owner, p_gen: gen }),
    collectCommit: (runId, owner, gen, fromOffset, toOffset, page: CollectPage) =>
      json<CollectCommitResult>("lead_collect_commit", {
        p_run_id: runId,
        p_owner: owner,
        p_gen: gen,
        p_from_offset: fromOffset,
        p_to_offset: toOffset,
        p_page: page as unknown as Json,
      }),
    checkCommit: (roundId, runId, results, usageUsd, last) =>
      json<{ ok: boolean }>("lead_check_commit", {
        p_round_id: roundId,
        p_run_id: runId,
        p_results: results as unknown as Json,
        p_usage_usd: usageUsd,
        p_last: last,
      }),
    roundEnd: (roundId, ending: LeadRoundEnding) => bool("lead_round_end", { p_round_id: roundId, p_ending: ending }),
    async runsEnsure(rows) {
      if (!rows.length) return [];
      // The id is derived from the round, the phase and the term (core runIdFor): a second inserter meets the first row and inserts nothing.
      const ins = await db.from("lead_runs").upsert(
        rows.map((r) => ({
          ...r,
          state: "claimed",
          apify_run_id: null,
          dataset_id: null,
          claimed_by: null,
          claimed_at: null,
          lease_owner: null,
          lease_gen: 0,
          lease_until: null,
          read_offset: 0,
          items_seen: 0,
          usage_usd: 0,
          finished_at: null,
        })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      must("lead_runs insert", ins);
      const back = await db.from("lead_runs").select("*").eq("round_id", rows[0].round_id);
      return must<RunRow[]>("lead_runs read back", back).map(runOf);
    },
    async round(id) {
      const r = await db.from("lead_rounds").select("*").eq("id", id).maybeSingle();
      const row = must<Database["public"]["Tables"]["lead_rounds"]["Row"] | null>("lead_rounds read", r);
      if (!row) return null;
      return {
        id: row.id,
        tenant_id: row.tenant_id,
        search_id: row.search_id,
        seq: row.seq,
        purpose: row.purpose as LeadRoundRow["purpose"],
        plan: row.plan as unknown as LeadSearchPlan,
        plan_version: row.plan_version,
        target: row.target,
        state: row.state as LeadRoundRow["state"],
        ending: row.ending as LeadRoundRow["ending"],
        ending_pending: row.ending_pending as LeadRoundRow["ending_pending"],
        question: row.question as unknown as LeadRoundRow["question"],
        answered: row.answered as LeadRoundRow["answered"],
        waiting_since: row.waiting_since,
        allowance_reserved: row.allowance_reserved,
        allowance_used: row.allowance_used,
        cost_reserved_usd: Number(row.cost_reserved_usd),
        cost_usd: Number(row.cost_usd),
        judge_tokens: row.judge_tokens,
        month: row.month,
        day: row.day,
        platform_day: row.platform_day,
      };
    },
    async run(id) {
      const r = await db.from("lead_runs").select("*").eq("id", id).maybeSingle();
      const row = must<RunRow | null>("lead_runs read", r);
      return row ? runOf(row) : null;
    },
    async runsOfRound(roundId) {
      return must<RunRow[]>("lead_runs of round", await db.from("lead_runs").select("*").eq("round_id", roundId)).map(
        runOf,
      );
    },
    async membersOfRound(roundId) {
      const members = must<Database["public"]["Tables"]["lead_search_members"]["Row"][]>(
        "lead_search_members read",
        await db.from("lead_search_members").select("*").eq("round_id", roundId),
      );
      if (!members.length) return [];
      const leads = must<
        Pick<
          Database["public"]["Tables"]["leads"]["Row"],
          "id" | "lat" | "lng" | "phone_e164" | "email" | "email_state"
        >[]
      >(
        "leads read",
        await db
          .from("leads")
          .select("id, lat, lng, phone_e164, email, email_state")
          .in(
            "id",
            members.map((m) => m.lead_id),
          ),
      );
      const byId = new Map(leads.map((l) => [l.id, l]));
      return members.map((m): LeadMemberRow => {
        const l = byId.get(m.lead_id);
        const j = m.judgment as { term?: unknown } | null;
        return {
          lead_id: m.lead_id,
          class: m.class as LeadMemberRow["class"],
          excluded_by: m.excluded_by,
          fit: m.fit as LeadMemberRow["fit"],
          reason: m.reason,
          distance_m: m.distance_m,
          counted: m.counted,
          judgment: m.judgment,
          lat: l?.lat ?? null,
          lng: l?.lng ?? null,
          phone: l?.phone_e164 ?? null,
          email: l?.email ?? null,
          email_state: (l?.email_state ?? "none") as LeadMemberRow["email_state"],
          term: typeof j?.term === "string" ? j.term : null,
        };
      });
    },
    async placeIdsHeld(tenantId, placeIds) {
      const out = new Map<string, string>();
      if (!placeIds.length) return out;
      const leads = must<{ id: string; place_id: string | null }[]>(
        "leads by place",
        await db
          .from("leads")
          .select("id, place_id")
          .eq("tenant_id", tenantId)
          .in("place_id", placeIds)
          .is("erased_at", null),
      );
      for (const l of leads) if (l.place_id) out.set(l.place_id, l.id);
      const places = must<{ lead_id: string; place_id: string }[]>(
        "lead_places by place",
        await db.from("lead_places").select("lead_id, place_id").eq("tenant_id", tenantId).in("place_id", placeIds),
      );
      for (const x of places) if (!out.has(x.place_id)) out.set(x.place_id, x.lead_id);
      return out;
    },
    async sharesOf(tenantId, keys) {
      const out: { key: string; share: LeadShare }[] = [];
      const lead = async (col: "phone_e164" | "email" | "website_host", kind: LeadShare["kind"], values: string[]) => {
        if (!values.length) return;
        const rows = must<Record<string, string | null>[]>(
          `leads by ${col}`,
          await db.from("leads").select(`id, ${col}`).eq("tenant_id", tenantId).in(col, values).is("erased_at", null),
        );
        for (const r of rows) if (r[col]) out.push({ key: r[col] as string, share: { kind, lead_id: r.id as string } });
      };
      await lead("phone_e164", "phone", keys.phones);
      await lead("email", "email", keys.emails);
      await lead("website_host", "host", keys.hosts);
      const person = async (col: "phone_e164" | "email", kind: LeadShare["kind"], values: string[]) => {
        if (!values.length) return;
        const rows = must<Record<string, string | null>[]>(
          `contacts by ${col}`,
          await db
            .from("contacts")
            .select(`id, ${col}`)
            .eq("tenant_id", tenantId)
            .in(col, values)
            .is("erased_at", null),
        );
        for (const r of rows)
          if (r[col]) out.push({ key: r[col] as string, share: { kind, contact_id: r.id as string } });
      };
      await person("phone_e164", "phone", keys.phones);
      await person("email", "email", keys.emails);
      return out;
    },
    async suppressed(tenantId, keys) {
      const emails = new Set<string>();
      const placeIds = new Set<string>();
      const wanted = [
        ...keys.emails.map((e) => ["email", e] as const),
        ...keys.placeIds.map((p) => ["place", p] as const),
      ];
      if (!wanted.length) return { emails, placeIds };
      // The same keyed digest 00140's lead_suppression_hash writes (contracts erasure.ts).
      const hashed = await Promise.all(
        wanted.map(async ([kind, v]) => [kind, v, await leadSuppressionHash(tenantId, v)] as const),
      );
      const byHash = new Map(hashed.map(([kind, v, h]) => [`${kind}:${h}`, v]));
      const rows = must<{ kind: string; hash: string }[]>(
        "lead_suppressions read",
        await db
          .from("lead_suppressions")
          .select("kind, hash")
          .eq("tenant_id", tenantId)
          .in(
            "hash",
            hashed.map(([, , h]) => h),
          ),
      );
      for (const r of rows) {
        const v = byHash.get(`${r.kind}:${r.hash}`);
        if (!v) continue;
        if (r.kind === "email") emails.add(v);
        else placeIds.add(v);
      }
      return { emails, placeIds };
    },
    async zoneOf(tenantId) {
      const r = must<{ timezone: string | null } | null>(
        "tenants read",
        await db.from("tenants").select("timezone").eq("id", tenantId).maybeSingle(),
      );
      return r?.timezone || "America/New_York";
    },
    leadSearchesOn: (tenantId) => bool("lead_searches_on", { p_tenant_id: tenantId }),
  };
}
