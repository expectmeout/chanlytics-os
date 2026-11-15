/**
 * What only a copy of the app may hold, on top of the run's own workspace (the nightly's whole suite, nightly-e2e.yml).
 *
 *   node --import tsx tooling/scripts/e2e-harness/copy-states.mjs
 *
 * e2e-workspace.mjs also writes production's workspace, so every row of it is one production's sweeps leave alone: no run
 * that is not sent, nothing anybody is waited on for. The specs that read a run waiting for an OK and emails handed to their
 * owner therefore skipped, whoever ran them (e2e/skip-ceiling.ts, first said by run 42323989353). On a copy nothing sweeps,
 * for no edge runs (decision 0106): a run waits as long as the night does and no send job ever comes for it. So these are
 * written here, after the seed and its own check, and nowhere else: this refuses any address but the runner's own.
 *
 *   - One run of the seed's own message to the three people, waiting for an OK. A one-off, whose day cannot pass (contracts
 *     runApprovalRefusal), so it still waits at whatever hour a spec reads it.
 *   - A reach-out its owner sends (00429), a first email and its nudge, whose two runs are going with an email each handed
 *     over: To send folds two or more such runs into its one row (contracts toSendRunsOf). To two of the places the waiting
 *     search left out, each given an address here, since an email is handed over only to one: e2e/leads.spec.ts reads the
 *     order and the acts of the Austin six, and a lead with an email handed over is "Yours to send", wherever it stood.
 *   - A list of the owner's own (00242), filed as an import files one, holding the three of the Austin six the finder did
 *     not qualify, each as the search judged it. A search the finder ran shows what it qualified alone (decision 0133) and
 *     a list keeps Needs review and Left out, its owner's to sort (D4), so e2e/leads.spec.ts reads an unconfirmed address,
 *     Keep and Put back on this list. Not in the seed, which production's workspace runs too: only the whole suite reads it.
 *
 * Nothing here is approved, sent or spent. The eval's paused Win-back, which the specs read as a sequence on a moment that
 * sends a message, is the seed's own (--seed-win-back), and the whole suite's seed passes it.
 */
import { createClient } from "@supabase/supabase-js";
import { DAY_MS, EVERYONE_LABEL, HOUR_MS, leadMonth } from "@chanlytics/contracts";
import { pathToFileURL } from "node:url";
import { CAMPAIGN_MESSAGE, LEADS, SLUG, TIMEZONE, memberJudgment } from "../ops/e2e-workspace.mjs";

/** The run waiting for an OK, by the name a spec or a person sees and a second run of this finds it by. */
export const WAITING_RUN = "e2e copy: waiting for an OK";
/** The reach-out, its nudge, and the two of the waiting search's places it handed an email for. */
export const HANDED_OVER = {
  name: "e2e copy: handed to you",
  nudge: "e2e copy: handed to you · nudge",
  template: "e2e_copy_handed_over",
  language: "en",
  subject: "A made-up note",
  body: "This is a made-up note for the nightly's checks, and nobody is asked to answer it.",
  leads: ["ChIJfixture0101", "ChIJfixture0102"],
};
/** The list of the owner's own, and the seed's places on it: the Austin six the finder did not qualify. */
export const OWN_LIST = {
  name: "e2e copy: a list of my own",
  leads: LEADS.filter((lead) => lead.member.class !== "qualified").map((lead) => lead.place_id),
};
/** How long the nudge waits after the first email (`sequence_steps_shape` asks for two days or more). */
const NUDGE_AFTER_DAYS = 3;
/** How the reach-out paces its sends, one of the gaps `sequence_steps_reach_out_gap` takes. */
const GAP_MINUTES = 30;

/** Whether an address is the runner's own: what this may write, and nothing else. */
export function isACopy(url) {
  return ["127.0.0.1", "localhost"].includes(new URL(url).hostname);
}

/** The workspace's own day at `now`, as a run or a round is dated. */
const dayIn = (now) => new Date(now).toLocaleDateString("en-CA", { timeZone: TIMEZONE });

function wrote(what, res) {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** What an earlier run of this left: the seed clears runs and their people, and leaves a step or a message where it is. */
async function clearEarlier(db, T) {
  for (const [table, name] of [
    ["sequence_batches", WAITING_RUN],
    ["sequence_steps", HANDED_OVER.nudge],
    ["sequence_steps", HANDED_OVER.name],
    ["lead_searches", HANDED_OVER.name],
    // Its round and its members go with it (their keys cascade).
    ["lead_searches", OWN_LIST.name],
  ])
    wrote(`clearing ${name}`, await db.from(table).delete().eq("tenant_id", T).eq("name", name));
}

/** The one-off waiting for an OK, on the message the seed's sent run went out on, to the people that run went to. */
async function writeWaitingRun(db, { T, ownerId, people, stamp, now }) {
  const template = wrote(
    "reading the seed's message",
    await db
      .from("templates")
      .select("id")
      .eq("tenant_id", T)
      .eq("name", CAMPAIGN_MESSAGE.name)
      .eq("language", CAMPAIGN_MESSAGE.language)
      .single(),
  );
  const run = wrote(
    "the run waiting for an OK",
    await db
      .from("sequence_batches")
      .insert({
        tenant_id: T,
        name: WAITING_RUN,
        template_id: template.id,
        template_name: CAMPAIGN_MESSAGE.name,
        template_language: CAMPAIGN_MESSAGE.language,
        params: [],
        audience: { kind: "everyone", id: null, label: EVERYONE_LABEL },
        state: "pending_approval",
        scheduled_for: new Date(now + DAY_MS).toISOString(),
        recipient_count: people.length,
        created_by: ownerId,
        created_at: stamp,
        step_id: null,
        run_for: null,
        channels: ["whatsapp"],
      })
      .select("id")
      .single(),
  );
  wrote(
    "its people",
    await db.from("sequence_sends").insert(
      people.map((p) => ({
        batch_id: run.id,
        tenant_id: T,
        contact_id: p.id,
        state: "queued",
        channel: "whatsapp",
        attempts: 0,
      })),
    ),
  );
}

/** One step of the reach-out, as its save writes one (00459): a first email takes the search, a nudge the step before it. */
async function writeStep(db, { T, ownerId, template }, step) {
  return wrote(
    `the reach-out's step ${step.name}`,
    await db
      .from("sequence_steps")
      .insert({
        tenant_id: T,
        kind: "reach_out",
        policy_class: "outreach",
        gap_minutes: GAP_MINUTES,
        template_id: template.id,
        template_name: HANDED_OVER.template,
        template_language: HANDED_OVER.language,
        params: [],
        channels: ["email"],
        state: "running",
        created_by: ownerId,
        ...step,
      })
      .select("id")
      .single(),
  );
}

/** The reach-out, its two going runs and the email each handed over, in the words the sender writes one (handOver, 00429). */
async function writeHandedOver(db, { T, ownerId, stamp, now }) {
  const text = `${HANDED_OVER.body}\n\n${SLUG}`;
  const components = [
    { type: "HEADER", format: "TEXT", text: HANDED_OVER.subject },
    { type: "BODY", text: HANDED_OVER.body },
  ];
  const words = {
    source: "chanlytics",
    category: "marketing",
    meta_status: "approved",
    components,
    body_preview: HANDED_OVER.body,
    title: HANDED_OVER.name,
  };
  const template = wrote(
    "the reach-out's words",
    await db
      .from("templates")
      .upsert(
        {
          tenant_id: T,
          channel: "email",
          name: HANDED_OVER.template,
          language: HANDED_OVER.language,
          ...words,
        },
        { onConflict: "tenant_id,channel,name,language" },
      )
      .select("id")
      .single(),
  );
  // A list of its own, empty, as every sequence to leads has (00459). Written onto a search of the seed's, that search would
  // be a sequence's list, which the rail files apart (contracts leadRail), and e2e/leads.spec.ts presses the waiting search's.
  const list = wrote(
    "the reach-out's list",
    await db.rpc("reach_out_list_for", { p_tenant_id: T, p_name: HANDED_OVER.name, p_by: ownerId }),
  );
  const leads = wrote(
    "reading the seed's leads",
    await db.from("leads").select("id, website_host").eq("tenant_id", T).in("place_id", HANDED_OVER.leads),
  );
  if (leads.length !== HANDED_OVER.leads.length) throw new Error("the seed's leads are not all there: run it first");
  for (const lead of leads) {
    lead.email = `hello@${lead.website_host}`;
    wrote(
      "a lead's address",
      await db
        .from("leads")
        .update({ email: lead.email, email_state: "ok", email_checked_at: stamp })
        .eq("id", lead.id),
    );
  }
  const on = { T, ownerId, template };
  const root = await writeStep(db, on, {
    name: HANDED_OVER.name,
    trigger: "lead_first",
    lead_search_id: list,
    owner_sends: true,
  });
  const nudge = await writeStep(db, on, {
    name: HANDED_OVER.nudge,
    trigger: "after_step",
    after_step_id: root.id,
    after_days: NUDGE_AFTER_DAYS,
  });
  const today = dayIn(now);
  const handedAt = new Date(now - HOUR_MS).toISOString();
  for (const [i, step] of [
    { id: root.id, name: HANDED_OVER.name },
    { id: nudge.id, name: HANDED_OVER.nudge },
  ].entries()) {
    const lead = leads[i];
    const run = wrote(
      `the run of ${step.name}`,
      await db
        .from("sequence_batches")
        .insert({
          tenant_id: T,
          name: `${step.name} · ${today}`,
          template_id: template.id,
          template_name: HANDED_OVER.template,
          template_language: HANDED_OVER.language,
          params: [],
          audience: { kind: "reach_out", root_id: root.id, step_id: step.id, search_id: list },
          state: "sending",
          scheduled_for: handedAt,
          started_at: handedAt,
          recipient_count: 1,
          created_by: ownerId,
          created_at: stamp,
          step_id: step.id,
          run_for: today,
          channels: ["email"],
        })
        .select("id")
        .single(),
    );
    wrote(
      "the email handed over",
      await db.from("sequence_sends").insert({
        tenant_id: T,
        batch_id: run.id,
        sequence_id: root.id,
        step_id: step.id,
        lead_id: lead.id,
        state: "drafted",
        channel: "email",
        attempts: 0,
        drafted_at: handedAt,
        draft: { to: lead.email, subject: HANDED_OVER.subject, body: HANDED_OVER.body, text },
      }),
    );
  }
}

/**
 * The list of the owner's own, as lead_search_import files one (its plan, `via` import, a round to the list's size) and
 * as a finished list stands: its round ended, the guard's one way there from queued (00140), and its places as the
 * search judged them, none counted. An import round that ends straight from queued rings no bell (lead_rounds_notify
 * waits for one leaving its checking).
 */
async function writeOwnList(db, { T, ownerId, stamp, now }) {
  const held = LEADS.filter((lead) => OWN_LIST.leads.includes(lead.place_id));
  const plan = {
    version: 1,
    card: "local_businesses",
    list: "import",
    name: OWN_LIST.name,
    asked: OWN_LIST.name,
    terms: [],
    count: held.length,
    contact: "email",
    criteria: [],
    exclusions: [],
  };
  const list = wrote(
    "the list of my own",
    await db
      .from("lead_searches")
      .insert({
        tenant_id: T,
        created_by: ownerId,
        via: "import",
        card: "local_businesses",
        name: OWN_LIST.name,
        asked: OWN_LIST.name,
        plan,
        created_at: stamp,
      })
      .select("id")
      .single(),
  );
  const round = wrote(
    "its round",
    await db
      .from("lead_rounds")
      .insert({
        tenant_id: T,
        search_id: list.id,
        seq: 1,
        purpose: "main",
        plan,
        plan_version: 1,
        target: held.length,
        state: "queued",
        month: leadMonth(TIMEZONE, new Date(now)),
        day: dayIn(now),
        platform_day: stamp.slice(0, 10),
        started_at: stamp,
        created_at: stamp,
      })
      .select("id")
      .single(),
  );
  wrote(
    "ending its round",
    await db
      .from("lead_rounds")
      .update({ state: "ended", ending: "target_reached", ended_at: stamp })
      .eq("id", round.id),
  );
  const leads = wrote(
    "reading the seed's leads",
    await db.from("leads").select("id, place_id").eq("tenant_id", T).in("place_id", OWN_LIST.leads),
  );
  if (leads.length !== held.length) throw new Error("the seed's leads are not all there: run it first");
  const idOf = new Map(leads.map((lead) => [lead.place_id, lead.id]));
  wrote(
    "its places",
    await db.from("lead_search_members").insert(
      held.map((lead) => ({
        search_id: list.id,
        lead_id: idOf.get(lead.place_id),
        round_id: round.id,
        tenant_id: T,
        judgment: memberJudgment(lead),
        class: lead.member.class,
        excluded_by: lead.member.excluded_by ?? null,
        fit: lead.member.fit,
        reason: lead.member.reason,
        counted: false,
        counted_month: null,
        created_at: stamp,
      })),
    ),
  );
}

/** Writes them into the seed's workspace, in place of what an earlier run of this left. */
export async function writeCopyStates(db, { now = Date.now() } = {}) {
  const tenant = wrote("reading the workspace", await db.from("tenants").select("id").eq("slug", SLUG).single());
  const T = tenant.id;
  const owner = wrote(
    "reading its owner",
    await db.from("memberships").select("user_id").eq("tenant_id", T).eq("role", "owner").single(),
  );
  const people = wrote("reading its people", await db.from("contacts").select("id").eq("tenant_id", T));
  const on = { T, ownerId: owner.user_id, stamp: new Date(now).toISOString(), now };
  await clearEarlier(db, T);
  await writeWaitingRun(db, { ...on, people });
  await writeHandedOver(db, on);
  await writeOwnList(db, on);
  return { tenantId: T };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  if (!isACopy(url)) {
    console.error(`${new URL(url).hostname} is not this machine's own stack: what this writes is for a copy alone`);
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await writeCopyStates(db);
  console.log(
    "- a run waits for an OK, two runs have handed an email each to their owner, and a list of the owner's own holds three places to sort",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
