/**
 * The check's tick over a database in memory (apps/edge/lib/campaigns/reach-out/check.ts), shared by its tests: the
 * workspaces, the step's words, the sends and their records, 00197's lease, spend and release as the SQL makes them, a
 * lead's preview and how one is made (00497 preview_make), and a model that answers by the business the record names.
 */
import { fakeDb } from "../../_fake-db.mjs";

const MIN = 60_000;
const DAY = 86_400_000;

export const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const TPL = "44444444-aaaa-4aaa-8aaa-444444444444";
export const WORDS = { subject: "Quick one", body: "{{opening}}\n\nI run Harbor. {{your name}}" };
export const ago = (ms) => new Date(Date.now() - ms).toISOString();
export const ahead = (ms) => new Date(Date.now() + ms).toISOString();

let n = 0;
export const send = (over = {}) => {
  n += 1;
  return {
    id: `send-${n}`,
    tenant_id: T,
    broadcast_id: "run-1",
    playbook_id: "root-1",
    root_id: "root-1",
    lead_id: `lead-${n}`,
    mailbox_id: "mbx-1",
    send_at: ahead(10 * MIN),
    state: "planned",
    reason: null,
    checked_at: null,
    check_tries: 0,
    check_after: null,
    check_first_at: null,
    check_started_at: null,
    check_gen: 0,
    checked_words: null,
    opening: null,
    angle: null,
    facts_used: [],
    hold_detail: null,
    included_for: [],
    created_at: ago(DAY),
    updated_at: ago(DAY),
    ...over,
  };
};
export const record = (name, over = {}) => ({
  business_name: name,
  category: "Moving company",
  city: "Austin",
  region: "TX",
  rating: 4.9,
  reviews: 16,
  website_host: `${name.toLowerCase().replace(/\s+/g, "")}.example`,
  hours: [],
  about: "Family-run since 2009.",
  email: `owner@${name.toLowerCase().replace(/\s+/g, "")}.example`,
  why_it_fits: "Independent mover",
  what_you_asked: "movers",
  site_listings: 1,
  name_listings: 1,
  email_domain_shared: false,
  ...over,
});

/**
 * 00197's lease over the tables, as the SQL makes it: planned, unchecked, past its backoff, not leased in the last two
 * minutes; stamped as it is handed over, with its step, its chain's name and its record. The SQL's round-robin, its
 * horizon and its joins are proved on a stack (reach-out-checked.db.test.mjs).
 */
export function world({
  sends = [],
  records = {},
  billing = "active",
  monthSent = 0,
  spentToday = 0,
  body = WORDS,
  own = [],
  previews = [],
  leads = [],
  run = "scheduled",
} = {}) {
  const tables = {
    tenants: [
      { id: T, name: "Harbor Moving Co", status: "active" },
      { id: T2, name: "Second Movers", status: "active" },
    ],
    tenant_config: [],
    business_records: [{ tenant_id: T, about: "We move homes across Austin." }],
    billing_accounts: billing ? [{ tenant_id: T, mode: "stripe", status: billing }] : [],
    templates: [
      {
        id: TPL,
        tenant_id: T,
        channel: "email",
        body_preview: null,
        components: [
          { type: "HEADER", text: body.subject },
          { type: "BODY", text: body.body },
        ],
      },
    ],
    reach_out_sends: sends,
    sequence_lead_words: own,
    // A lead's own preview (decision 0079), read for the line of an email that carries its link, and the leads one is
    // made for; the run its sends are in, waiting for its owner or going ahead, and the jobs a preview's build is.
    lead_previews: previews,
    leads,
    sequence_batches: [{ id: "run-1", tenant_id: T, state: run }],
    jobs: [],
    // What the workspace's model attempts spent this UTC day (00197), counted against its ceiling.
    reach_out_check_spend: [{ tenant_id: T, day: new Date().toISOString().slice(0, 10), attempts: spentToday }],
  };
  const leased = [];
  const db = fakeDb(
    tables,
    {},
    {
      sequence_unchecked: (a) => {
        const now = new Date().toISOString();
        const free = (s) =>
          s.state === "planned" &&
          s.checked_at == null &&
          (s.check_after == null || s.check_after <= now) &&
          (s.check_started_at == null || s.check_started_at < ago(2 * MIN)) &&
          (!a.p_tenant_id || s.tenant_id === a.p_tenant_id) &&
          (!a.p_send_ids || a.p_send_ids.includes(s.id));
        const perWorkspace = new Map();
        const picked = [];
        for (const s of tables.reach_out_sends.filter(free)) {
          const k = perWorkspace.get(s.tenant_id) ?? 0;
          if (k >= a.p_per_workspace || picked.length >= a.p_limit) continue;
          perWorkspace.set(s.tenant_id, k + 1);
          picked.push(s);
        }
        for (const s of picked) {
          s.check_started_at = now;
          leased.push(s.id);
        }
        return picked.map((s) => ({
          // As sequence_sends holds it (00440): what sequence_unchecked hands back since 00441.
          send: (({ broadcast_id, playbook_id, root_id, ...x }) => ({
            ...x,
            batch_id: broadcast_id,
            step_id: playbook_id,
            sequence_id: root_id,
          }))(s),
          check_gen: s.check_gen,
          template_id: TPL,
          template_language: "en",
          signed_by: "Sam",
          included_for: s.included_for,
          due_soon: s.due_soon !== false,
          ...(records[s.lead_id] ?? record(`Fixture Movers ${s.lead_id}`)),
        }));
      },
      reach_out_month_sent: () => monthSent,
      // 00497's door: the lead's preview, made building where it has none, as the door makes it.
      preview_make: (a) => {
        const standing = tables.lead_previews.find((r) => r.lead_id === a.p_lead_id);
        if (standing)
          return {
            id: standing.id,
            token: standing.token,
            state: standing.state,
            preview_tenant_id: null,
            made: false,
          };
        const made = {
          id: `pv-${a.p_lead_id}`,
          tenant_id: a.p_tenant_id,
          lead_id: a.p_lead_id,
          preview_tenant_id: null,
        };
        Object.assign(made, {
          state: "building",
          token: "MadeMadeMadeMadeMade01",
          created_at: new Date().toISOString(),
        });
        tables.lead_previews.push(made);
        return { id: made.id, token: made.token, state: made.state, preview_tenant_id: null, made: true };
      },
      // 00197's spend and release, as the SQL makes them (proved on a stack, reach-out-checked.db.test.mjs).
      reach_out_check_take: (a) => {
        const day = a.p_at.slice(0, 10);
        let row = tables.reach_out_check_spend.find((x) => x.tenant_id === a.p_tenant_id && x.day === day);
        if (!row) tables.reach_out_check_spend.push((row = { tenant_id: a.p_tenant_id, day, attempts: 0 }));
        if (row.attempts >= a.p_cap) return false;
        row.attempts += 1;
        return true;
      },
      reach_out_release_unavailable: (a) => {
        let n = 0;
        for (const s of tables.reach_out_sends)
          if (
            s.state === "held" &&
            s.reason === "check_unavailable" &&
            s.hold_detail == null &&
            s.updated_at < a.p_before &&
            (!a.p_tenant_id || s.tenant_id === a.p_tenant_id)
          ) {
            Object.assign(s, {
              state: "planned",
              reason: null,
              checked_at: null,
              check_gen: s.check_gen + 1,
              checked_words: null,
              check_tries: 0,
              check_first_at: null,
              check_after: null,
              check_started_at: null,
              opening: null,
              angle: null,
              facts_used: [],
              hold_detail: null,
            });
            n += 1;
          }
        return n;
      },
    },
  );
  const row = (id) => tables.reach_out_sends.find((s) => s.id === id);
  return { db, tables, row, leased };
}
export const HOUR_AGO = 3_600_000;
/** A model that answers by the business the record names. */
export function byBusiness(scripts) {
  const calls = [];
  const ask = async (system, user) => {
    calls.push(user);
    const key = Object.keys(scripts).find((name) => user.includes(`name: ${name}`));
    const next = key ? scripts[key].shift() : undefined;
    if (next instanceof Error) throw next;
    return next === undefined ? null : { answer: next, tokens: { input: 10, output: 5 } };
  };
  return { ask, calls };
}
