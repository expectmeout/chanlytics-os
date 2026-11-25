/**
 * The world the tests of workspace/ share: the nightly's own workspace, converged over the database in memory. Split
 * by behaviour from e2e-workspace.test.mjs on 25 Nov 2026 (layer 14: a test file over 1,600 lines is two files); its
 * header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * The nightly's own workspace, converged against a database in memory.
 *
 * e2e-workspace.mjs runs every night against production with the service role,
 * so what it may touch is the whole question. These run it: twice, to see that
 * nothing duplicates; after the specs have left things behind, to see them put
 * back; and against the accounts and workspaces it must refuse, to see that it
 * writes nothing there. The rows it writes are checked against the states the
 * production sweeps leave alone, and its one alert address against the edge's
 * own rule for who is told. The Receptionist lens's rows (convergeReceptionist)
 * are held to the same bar, and to what the lens reads of them; so are the People
 * lens's (convergePeople: a yes on the ledger for each person, three steps done,
 * and no step open); so are the Campaigns lens's (convergeCampaigns: one run that
 * went out to the three people, two messages delivered, one reply and the owner's
 * approval, and no run, message or job anything could still be waiting on).
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { DAY_MS, HOUR_MS } from "@chanlytics/contracts";
import * as seed from "../../../tooling/scripts/ops/e2e-workspace.mjs";
import { converge, PEOPLE, TIMEZONE } from "../../../tooling/scripts/ops/e2e-workspace.mjs";

// The Google sweep as production runs it: the Places key and the OAuth client set, and a wire where Google would be that
// knows no fixture place (Google answers 404) and nothing else. Installed before the sweep's modules load: places.ts binds
// `fetch` as it is then.
process.env.GOOGLE_PLACES_API_KEY = "places-key-for-this-file";

process.env.GOOGLE_OAUTH_CLIENT_ID = "oauth-client-for-this-file";

process.env.GOOGLE_OAUTH_CLIENT_SECRET = "oauth-secret-for-this-file";

process.env.GOOGLE_OAUTH_REDIRECT_URI = "https://dash.test/api/v1/google/callback";

export const wire = [];

globalThis.fetch = async (url, init) => {
  wire.push(`${init?.method ?? "GET"} ${String(url).split("?")[0]}`);
  if (String(url).startsWith("https://places.googleapis.com/v1/places/"))
    return new Response(JSON.stringify({ error: { code: 404, status: "NOT_FOUND" } }), { status: 404 });
  throw new Error(`nothing on the wire answers ${url}`);
};

export const here = path.dirname(fileURLToPath(import.meta.url));

export const { chooseAddressing, reachesTenant } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/shared/alerts/notify.ts")).href
);

export const { planLeadSweep, QUESTION_WAIT_MS } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/leads/sweep-plan.ts")).href
);

export const { googleReader, sweepGoogle } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/google/sweep.ts")).href
);

export const { listListingsDue, listConnectionsDue } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/google/listing-check.ts")).href
);

export const { sweepUnfinished } = await import(
  pathToFileURL(path.join(here, "../../../apps/edge/lib/receptionist/unfinished.ts")).href
);

// The Receptionist lens's rows (convergeReceptionist), named by what the seed exports.
export const { RECEPTIONIST_PREFIX, MISSED_CALL_ID } = seed;

// The People lens's rows (convergePeople): the prefix of each step's words and the note on each yes's event.
export const { PEOPLE_PREFIX, PEOPLE_NOTE } = seed;

// The Campaigns lens's rows (convergeCampaigns): the prefix of its messages' ids, the mark on its approval, the run's name
// and the message it sent.
export const { CAMPAIGNS_PREFIX, CAMPAIGNS_NOTE, CAMPAIGN_RUN, CAMPAIGN_MESSAGE } = seed;

export const OWNER = "e2e-owner@example.com";

export const MATE = "e2e-member@example.com";

export const NOW = Date.parse("2026-09-14T09:00:00Z");

export const MODES = {
  faq: "auto",
  booking: "auto",
  reply: "auto",
  reengage: "veto",
  campaign: "veto",
  reviews: "ask",
  money: "never",
  follow_up: "veto",
};

/** The moves 00140's lead_rounds_guard allows, and nothing else. */
export const ROUND_MOVES = {
  queued: ["probing", "running", "ended"],
  probing: ["waiting_on_owner", "running", "checking", "ended"],
  waiting_on_owner: ["running", "ended"],
  running: ["checking", "ended"],
  checking: ["ended"],
  ended: [],
};

/**
 * lead_rounds as the database keeps it: 00140's guard (a round starts queued and moves only as it allows) and
 * 00163's lead_rounds_notify (a round that stops to ask, or ends with anything but stopped or question_unanswered,
 * gets its bell row -- unless one of that kind for that round is already there -- and a push_send job with it).
 * The trigger is AFTER UPDATE, so it reads the row once the whole update has landed. `moves` records every state
 * a round passed through, with the row as it stood, so a test can put each one in front of the sweep.
 */
export function roundsTable(t, moves) {
  const notify = (r) => {
    const search = (t.lead_searches ?? []).find((s) => s.id === r.search_id);
    if (!search) return;
    const kind =
      r.state === "waiting_on_owner"
        ? "leads_question"
        : r.state === "ended" && !["stopped", "question_unanswered"].includes(r.ending)
          ? "leads_ready"
          : null;
    if (!kind) return;
    const bell = (t.notifications ??= []);
    if (bell.some((n) => n.tenant_id === r.tenant_id && n.kind === kind && n.subject_id === r.id)) return;
    const id = crypto.randomUUID();
    bell.push({ id, tenant_id: r.tenant_id, kind, title: `from the trigger: ${search.name}`, subject_id: r.id });
    (t.jobs ??= []).push({
      id: crypto.randomUUID(),
      tenant_id: r.tenant_id,
      kind: "push_send",
      payload: { notification_id: id },
    });
  };
  const guarded = (row) => {
    if (row.state !== "queued") throw new Error(`a round starts queued (${row.state} refused)`);
    moves.push({ ...row });
    return new Proxy(row, {
      set(target, key, value) {
        if (key === "state" && value !== target.state) {
          if (!ROUND_MOVES[target.state].includes(value))
            throw new Error(`lead_rounds.state ${target.state} -> ${value} refused`);
          target.state = value;
          queueMicrotask(() => {
            moves.push({ ...target });
            notify(target);
          });
          return true;
        }
        target[key] = value;
        return true;
      },
    });
  };
  const rows = [];
  rows.push = (...made) => Array.prototype.push.apply(rows, made.map(guarded));
  return rows;
}

/** A database in memory, an auth admin, and provision_tenant as the migrations write it. */
export function world(tables = {}) {
  // The platform's one row exists on every database release A touched; the seed
  // adds this workspace to tenants_on and must never flip searches_on.
  const moves = [];
  const t = {
    tenants: [],
    memberships: [],
    lead_platform: [{ id: true, searches_on: false, tenants_on: [] }],
    ...tables,
  };
  t.lead_rounds = roundsTable(t, moves);
  const users = [];
  const db = fakeDb(
    t,
    {},
    {
      provision_tenant: ({ p_tenant_id }) => {
        const rows = (name) => (t[name] ??= []);
        for (const [cls, mode] of Object.entries(MODES)) {
          if (!rows("policies").some((p) => p.tenant_id === p_tenant_id && p.class === cls && p.subject_type == null)) {
            rows("policies").push({
              id: crypto.randomUUID(),
              tenant_id: p_tenant_id,
              class: cls,
              mode,
              subject_type: null,
              subject_id: null,
              limits: {},
            });
          }
        }
        if (!rows("tenant_config").some((r) => r.tenant_id === p_tenant_id))
          rows("tenant_config").push({ tenant_id: p_tenant_id, config: {}, version: 1 });
        if (!rows("billing_accounts").some((r) => r.tenant_id === p_tenant_id))
          rows("billing_accounts").push({ tenant_id: p_tenant_id, mode: "stripe", status: "none" });
        return null;
      },
      // Vault holds nothing for the workspace: the Business Profile it is seeded with has no credentials.
      get_google_credentials: () => null,
    },
  );
  db.auth = {
    admin: {
      listUsers: async ({ page }) => ({ data: { users: page === 1 ? users.map((u) => ({ ...u })) : [] }, error: null }),
      createUser: async ({ email }) => {
        const user = { id: crypto.randomUUID(), email };
        users.push(user);
        return { data: { user }, error: null };
      },
    },
  };
  return { db, t, users, moves };
}

export const run = (w, over = {}) =>
  converge(w.db, { ownerEmail: OWNER, memberEmail: MATE, apply: true, now: NOW, ...over });

export const of = (t, table, tenantId) => (t[table] ?? []).filter((r) => r.tenant_id === tenantId);

/** The seeded person with this phone number, and their conversation. */
export const personAt = (t, tenantId, phone) => of(t, "contacts", tenantId).find((c) => c.phone_e164 === phone);

export const threadOf = (t, tenantId, phone) => {
  const person = personAt(t, tenantId, phone);
  return of(t, "conversations", tenantId).find((c) => c.contact_id === person?.id);
};

export const [ROBIN, CASEY, SAM] = PEOPLE;

/** An instant read back as the workspace's own clock: its day, "HH:MM", and the quarter hour of the day (0 to 95). */
export function localOf(at, zone = TIMEZONE) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value]),
  );
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    clock: `${p.hour}:${p.minute}`,
    q: Number(p.hour) * 4 + Math.floor(Number(p.minute) / 15),
  };
}

export const quietLog = { info() {}, warn() {}, error() {}, debug() {} };

/** What a customer's own words are: everything but mail read as automated (public.message_is_a_persons_words, 00299). */
export const personsWords = (m) => !["automated", "auto_reply", "report"].includes(m.meta?.email?.claim ?? "person");

// ---------------------------------------------------------------------------------------------------------------------
// The People lens's rows (convergePeople): a yes for each seeded person on the ledger, and three steps the team finished.
// ---------------------------------------------------------------------------------------------------------------------

/** The yes events of the workspace, the seed's own and anyone's. */
export const yesEvents = (t, tenantId) => of(t, "events", tenantId).filter((e) => e.kind === "contact.consent_changed");

/** The steps the seed wrote: the notes whose words start with its prefix. */
export const seededSteps = (t, tenantId) =>
  of(t, "person_notes", tenantId).filter((n) => String(n.body).startsWith(PEOPLE_PREFIX));

/** The workspace's own day `n` days before the run at NOW (which is 05:00 in New York, so no clock change is near it). */
export const dayBack = (n) => localOf(NOW - n * DAY_MS).day;

// ---------------------------------------------------------------------------------------------------------------------
// The Campaigns lens's rows (convergeCampaigns): one run that went out to the three seeded people, and what came of it.
// ---------------------------------------------------------------------------------------------------------------------

/** The seed's run, found by its name; the people on it; the messages it wrote, found by their prefix; the approval it was given, by its mark. */
export const theRun = (t, tenantId) => of(t, "broadcasts", tenantId).filter((b) => b.name === CAMPAIGN_RUN);

export const runPeople = (t, tenantId) => of(t, "broadcast_recipients", tenantId);

export const campaignMessages = (t, tenantId) =>
  of(t, "messages", tenantId).filter((m) => String(m.external_id ?? "").startsWith(CAMPAIGNS_PREFIX));

export const approvalsOf = (t, tenantId) =>
  of(t, "decisions", tenantId).filter((d) => d.payload?.seed === CAMPAIGNS_NOTE);

/** The reply window of a send (public.campaign_reply_window, contracts REPLY_WINDOW_HOURS). */
export const REPLY_WINDOW_MS = 72 * HOUR_MS;

/**
 * What the lens's reply probe finds for a person a run sent to (00405 `sent`): the first thing they wrote in the thread the
 * message went to, in their own words, after the send and within the window. Milliseconds after the send, or null.
 */
export function firstReplyAfter(t, tenantId, recipient) {
  const sentAt = Date.parse(recipient.sent_at);
  const sentMessage = of(t, "messages", tenantId).find((m) => m.id === recipient.message_id);
  const replies = of(t, "messages", tenantId)
    .filter(
      (m) =>
        m.conversation_id === sentMessage?.conversation_id &&
        m.direction === "inbound" &&
        m.sender === "customer" &&
        personsWords(m) &&
        Date.parse(m.created_at) > sentAt &&
        Date.parse(m.created_at) <= sentAt + REPLY_WINDOW_MS,
    )
    .map((m) => Date.parse(m.created_at));
  return replies.length ? Math.min(...replies) - sentAt : null;
}
