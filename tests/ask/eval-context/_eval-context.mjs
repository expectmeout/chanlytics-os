/**
 * The world the tests of eval-context/ share. Split by behaviour from eval-ask-context.test.mjs on 25 Nov 2026 (layer
 * 14: a test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
// The page an eval case is asked on (tooling/scripts/eval-ask-context.mjs; the Phase 2 plan, PR 2.3): built from what
// the page's GETs answer, the way the palette builds it, and held to the schema the route reads it with; the judge's
// excuse for a case the page answers, and what a case's page asks of the answer; the case set's pages, each built
// over fixture answers and placed on its surface as the palette places its route; and the runner's listing, run with
// no credentials, which says every case, the turns and their cost and spends nothing. A case's second turn (the Phase
// 5 plan, PR 5.2): its page and its scope, what turn 1 asks of it (names_card, opens_item, drops_first_scope and the
// claims no answer may make), a settings note approved between the turns and put back over a fake settings door, the
// cost read turn by turn and past PostgREST's thousand rows, and the ten cases that carry one.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PageContextSchema,
  TenantConfigWriteSchema,
  applySettingsChange,
  channelChoices,
  parseTenantConfig,
} from "@chanlytics/contracts";
import { workspaceConfig } from "../../../tooling/scripts/ops/e2e-workspace.mjs";

export const { surfaceFor } = await import("../../../apps/dashboard/src/bridge/ask/palette.ts");

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const U = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

export const hoursAgo = (h) => new Date(Date.UTC(2026, 8, 26, 12) - h * 3_600_000).toISOString();

/** The GETs' answers (their `data`), as the eval workspace would give them: made-up people, 555-01xx numbers. */
export const ANSWERS = {
  conversations: {
    conversations: [
      {
        id: U(1),
        last_message_at: hoursAgo(2),
        contact: { id: U(11), display_name: "Robin Example", wa_profile_name: "Robin", phone_e164: "+12125550143" },
        messages: [],
      },
      {
        id: U(2),
        last_message_at: hoursAgo(30),
        contact: { id: U(13), display_name: null, wa_profile_name: null, phone_e164: "+12125550145" },
        messages: [],
      },
    ],
  },
  calls: {
    calls: [
      {
        id: U(3),
        started_at: hoursAgo(26),
        contact: { display_name: "Casey Example", wa_profile_name: null, phone_e164: "+12125550144" },
      },
    ],
  },
  contacts: {
    people: [
      { id: U(11), display_name: "Robin Example", wa_profile_name: "Robin", phone_e164: "+12125550143" },
      { id: U(12), display_name: "Casey Example", wa_profile_name: null, phone_e164: "+12125550144" },
      { id: U(13), display_name: "Sam Example", wa_profile_name: null, phone_e164: "+12125550145" },
    ],
    page: { q: null, offset: 0, limit: 1000, total: 3, has_more: false },
  },
  leads: {
    rows: [
      { id: U(21), business_name: "Example Strength Lab" },
      { id: U(22), business_name: "Example Coaching Co." },
    ],
    next: null,
  },
  "lead-searches": { searches: [{ id: U(31), name: "Pilates studios · Denver" }], counts: {} },
  playbooks: { playbooks: [], has_deals: false },
  broadcasts: { broadcasts: [], more: false, touched_at: null },
  templates: { templates: [] },
};

export const accepted = (context) => {
  const read = PageContextSchema.safeParse(context);
  assert.ok(read.success, `a context the route takes: ${JSON.stringify(read.error?.issues ?? [])}`);
};

/* ---- a case's second turn (the Phase 5 plan, PR 5.2) ---- */

export const PEOPLE_PAGE = { surface: "people", route: "clients", rows: "GET contacts:40" };

export const TWO_TURNS = {
  id: "x",
  surface: "people",
  must_never: true,
  text: "list the people on this page in alphabetical order",
  context: PEOPLE_PAGE,
  expect: { no_write: true },
  then: { text: "open the second", expect: { no_write: true } },
};

export const T1 = U(71);

/** An item of an answer, as the Line draws it: a row, grounded, with the route its reader gave it. */
export const item = (id, label, to = `clients/${id}`) => ({
  title: label,
  meta: "",
  line: "",
  source: { kind: "person", id, label, to, door: true },
});

/** A final message as the route streams it, with the answer's items and the turn's cards. */
export const final = ({ text = "Here they are.", items = [], proposals = [], navigate = null } = {}) => ({
  id: U(81),
  text,
  citations: items.map((i) => ({ kind: i.source.kind, id: i.source.id, label: i.source.label, to: i.source.to })),
  navigate,
  proposals,
  answer: {
    v: 2,
    form: "structured",
    say: { headline: text, detail: "" },
    show: { figures: [], items, breakdown: null },
    do: { open: navigate ? { to: navigate.to, label: navigate.label ?? "", now: !!navigate.now } : null, next: [] },
    language: "en",
  },
});

export const CARD = {
  id: "p-1",
  kind: "settings",
  needs: "partner",
  title: "Remember this",
  summary: "AI knows.",
  payload: { change: { op: "add_note", title: "Parking", text: "Parking is behind the building." } },
  undo: "Put the previous settings back",
};

/* ---- a card approved between the turns, and put back ---- */

/** The nightly's workspace config as GET settings answers it (e2e-workspace.mjs): no profile, so no hours or notes. */
export const SEED = parseTenantConfig(workspaceConfig());

export const NOTE = { title: "Parking", text: "Parking is behind the building." };

/** The same with turn 1's note in it, as the settings door stores it and GET settings answers it. */
export const NOTED = parseTenantConfig(
  TenantConfigWriteSchema.parse(applySettingsChange(SEED, { op: "add_note", ...NOTE })),
);

export const ORIGIN = "https://app.example.com";

export const OUTCOME = `POST /api/v1/ask/messages/${U(81)}/proposals/p-1`;

/** A teammate's save, as the settings door takes one: their phone line in the config, one version on. */
export const teammate = (state) => {
  state.stored = TenantConfigWriteSchema.parse({
    ...state.config,
    brain: { ...state.config.brain, phone_display: "(212) 555-0199" },
  });
  state.version += 1;
};

/**
 * The settings door and a card's outcome door, as their routes answer them. GET settings reads the stored config back
 * through the read schema; PUT settings takes `{ config, version }` -- a 409 on a stale version before anything is
 * written (putTenantConfig matches on the version), a 400 when the write schema refuses -- and stores what the write
 * schema keeps, one version on; POST records an outcome. The rest is what the test makes happen: `hold` answers a
 * door's next request with a refusal and writes nothing; `stall` leaves it unanswered until its signal gives up;
 * `beforePut` lands a save of someone else's just before the next PUT is judged; `afterWrite` answers the next saves,
 * once they have stored, with a refusal or no answer at all (status 0), after `then` lands anything else; `mangle`
 * changes what a save stores.
 */
export function doors({ version = 7, hold = {}, stall = {}, beforePut = [], afterWrite = [], mangle = (c) => c } = {}) {
  const state = {
    stored: structuredClone(workspaceConfig()),
    version,
    hold,
    stall,
    calls: [],
    outcomes: [],
    /** The settings as GET settings answers them now. */
    get config() {
      return parseTenantConfig(this.stored);
    },
  };
  const answer = (status, data) =>
    new Response(JSON.stringify(status < 400 ? { data } : { error: { code: "refused", message: data } }), { status });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? "GET";
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    const key = `${method} ${u.pathname}`;
    state.calls.push({ key, workspace: u.searchParams.get("workspace"), headers: init.headers ?? {}, body });
    // A door that hangs holds its socket open, and so the run, until the request's own signal gives up on it.
    if (state.stall[key]?.shift())
      return new Promise((_, fail) => {
        const open = setInterval(() => {}, 1_000);
        init.signal.addEventListener("abort", () => {
          clearInterval(open);
          fail(init.signal.reason);
        });
      });
    const held = state.hold[key]?.shift();
    if (held) return answer(held.status, held.message);
    if (key === "GET /api/v1/settings")
      return answer(200, { config: state.config, version: state.version, config_broken: false });
    if (key === "PUT /api/v1/settings") {
      beforePut.shift()?.(state);
      if (body.version !== state.version) return answer(409, "Someone else saved settings after you loaded them.");
      const w = TenantConfigWriteSchema.safeParse(body.config);
      if (!w.success) return answer(400, "Config rejected");
      state.stored = mangle(w.data);
      state.version += 1;
      const after = afterWrite.shift();
      after?.then?.(state);
      if (after?.status === 0) throw new TypeError("fetch failed");
      if (after?.status) return answer(after.status, after.message);
      return answer(200, { config: state.config, version: state.version });
    }
    if (method === "POST" && /^\/api\/v1\/ask\/messages\/[^/]+\/proposals\/p-[a-z0-9-]+$/.test(u.pathname)) {
      state.outcomes.push(body);
      return answer(200, { proposal: {} });
    }
    return answer(404, "no such door");
  };
  const io = {
    fetch,
    at: (p) => `${ORIGIN}${p}?workspace=W`,
    cookie: "sb-x-auth-token=1",
    origin: ORIGIN,
    now: () => 1000,
    timeoutMs: 50,
  };
  return { state, io, keys: () => state.calls.map((c) => c.key) };
}

export const approved = final({ text: "One card to review: Remember this.", proposals: [CARD] });

export const SETTINGS = ["GET /api/v1/settings", "PUT /api/v1/settings"];

/* ---- what a run cost, turn by turn ---- */

/** PostgREST over rows in memory, as the service role reads it: a thousand rows at most, whatever the limit says. */
export function postgrest(tables) {
  const paths = [];
  const rest = async (p) => {
    paths.push(p);
    const u = new URL(`https://db.example.com/rest/v1/${p}`);
    const rows = tables[u.pathname.split("/").pop()] ?? [];
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(u.searchParams.get("limit") ?? 1000), 1000);
    const ids = u.searchParams
      .get("id")
      ?.replace(/^in\.\(|\)$/g, "")
      .split(",");
    return (ids ? rows.filter((r) => ids.includes(r.id)) : rows).slice(offset, offset + limit);
  };
  return { rest, paths };
}

export const CASES = JSON.parse(readFileSync(path.join(ROOT, "tooling/evals/ask-cases.json"), "utf8"));

export const SURFACES = [
  "inbox",
  "people",
  "leads",
  "reports",
  "settings",
  "conversations",
  "calendar",
  "campaigns",
  "pipeline",
];

/** The setup and change cases (the moment spec, A8; the Ask note's §4), in the case set's order. */
export const SETUP_AND_CHANGE = [
  "setup_campaigns_first_day",
  "setup_campaigns_es",
  "setup_from_today",
  "setup_meeting_reminder",
  "setup_leads_refused",
  "setup_new_list_then_playbook",
  "setup_again_same_thread",
  "change_resume_by_name",
  "change_pause_already_paused",
  "change_rename_and_hour",
  "change_hour_out_of_bounds",
  "change_leads_pause",
  // A change's new fields (00416; the review after the merge, batch E): its words, its last day, and since 00462 its
  // sequence's mode, where its trial was.
  "change_words",
  "change_last_day",
  "change_hold_each_batch",
  // A setup with a calendar and without one (the marketing manager's §8): the same words, two workspaces.
  "setup_with_calendar",
  "setup_without_calendar",
];

/** The reads the marketing manager's lane added (its §5.7), each asked for by a case in its own words. */
export const NEW_READS = ["calendar.room", "sequences.journey", "sequences.messages"];

/** The nightly's workspace as its seed leaves it (e2e-workspace.mjs), in the cases' tokens, before the Win-back's seed. */
export const NIGHTLY = ["no_calendar", "no_offers_channel", "no_offers_yes"];

/** The offer's channels a workspace opens, by the rule an offer's plan reads (act/plan.ts planWorld). */
export const offerChannels = (ready) =>
  channelChoices(ready, "marketing", "ours").filter((c) => c.channel !== "sms" && c.ok);

/* ---- X5-4: a thread snoozed between two warm turns, judged and woken ---- */

export const DANA = { kind: "thread", id: U(91), label: "Dana Example", to: `inbox/${U(91)}` };

export const RIO = { kind: "thread", id: U(92), label: "Rio Example", to: `inbox/${U(92)}` };

export const needsMe = final({
  text: "Dana Example and Rio Example need you.",
  items: [{ source: DANA }, { source: RIO }],
});

/** A thread door: GET a thread's state, snooze it, wake it; `hold` answers a key its way once, as the settings door's does. */
export function threadDoor({ state = "needs_human", hold = {} } = {}) {
  const s = { state, calls: [], hold };
  const answer = (status, data) =>
    new Response(JSON.stringify(status < 400 ? { data } : { error: { code: "refused", message: data } }), { status });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method ?? "GET"} ${u.pathname}`;
    s.calls.push({ key, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const held = s.hold[key]?.shift();
    if (held?.then) held.then(s);
    if (held?.status) return answer(held.status, held.message);
    if (key === `GET /api/v1/conversations/${DANA.id}`)
      return answer(200, { conversation: { id: DANA.id, state: s.state } });
    if (key === `POST /api/v1/conversations/${DANA.id}/snooze`)
      return ((s.state = "snoozed"), answer(200, { state: "snoozed" }));
    if (key === `POST /api/v1/conversations/${DANA.id}/wake`)
      return ((s.state = "open"), answer(200, { state: "open" }));
    return answer(404, "no such door");
  };
  const io = {
    fetch,
    at: (p) => `${ORIGIN}${p}?workspace=W`,
    cookie: "sb-x-auth-token=1",
    origin: ORIGIN,
    now: () => 1000,
    timeoutMs: 50,
  };
  return { s, io, keys: () => s.calls.map((c) => c.key) };
}

export const READ = `GET /api/v1/conversations/${DANA.id}`;

export const SNOOZE = `POST /api/v1/conversations/${DANA.id}/snooze`;

export const WAKE = `POST /api/v1/conversations/${DANA.id}/wake`;
