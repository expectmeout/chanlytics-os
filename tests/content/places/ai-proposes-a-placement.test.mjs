/**
 * AI proposes a placement (the content loop PRD's 6.2, the first of the three moments; propose_publish): the card is held
 * to the same checks the press makes, before it exists. A person named in it who has not said yes stops it by name, with
 * the ask offered; AI paused stops it. Words AI drafts that plainly name a day, an offer or a price say what they are
 * about, or that they date nothing, and the card carries it to the press. A fact is the owner's only in their own words in
 * this question: AI never states one for them. A made video goes as a reel, and a picture never does.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { postPublishOf, publishSpec } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";
process.env.EDGE_PROVIDERS = "live";
delete process.env.VERCEL_ENV;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

/** The Meta link, switched on for every workspace here, as the edge says it. */
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes("/api/admin/meta/connection")) return realFetch(input, init);
  const app = { client_id: "1", config_id: "2", redirect_uri: "https://app.example/cb" };
  return new Response(JSON.stringify({ ok: true, ready: true, on: true, app }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
after(() => {
  globalThis.fetch = realFetch;
});

const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { buildProposal, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
after(() => setServiceClient(null));

const USER = "11111111-1111-4111-8111-111111111111";
const MADE = "ffffffff-0000-4000-8000-000000000002";
let seq = 0;

/** One workspace with one made post (or video), and AI asked to put it up. */
async function proposed({
  input = {},
  question = "Put the Fridays post up.",
  caption = "Open late on Fridays.",
  rights = { is: "ok" },
  stopped = false,
  video = false,
} = {}) {
  seq += 1;
  const tenant = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, "0")}`;
  const made = { plan: { line: "Open late on Fridays", under: null }, caption };
  const file = {
    id: MADE,
    tenant_id: tenant,
    status: "filed",
    source: "made",
    source_ref: null,
    name: "open-late-on-fridays",
    kind: video ? "video" : "photo",
    mime: video ? "video/mp4" : "image/jpeg",
    bytes: 1_000_000,
    seconds: video ? 13 : null,
    width: 1080,
    height: video ? 1920 : 1350,
    look: { line: "A post saying Open late on Fridays." },
    look_status: "done",
    shows: "graphic",
    who_in_it: "no_one",
    made,
    removed_at: null,
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
  };
  const piece = {
    id: "99999999-0000-4000-8000-000000000001",
    tenant_id: tenant,
    file_id: MADE,
    shape: "blocks",
    plan: { blocks: [], caption },
    look: {},
    status: "made",
    stage: "queued",
    edition: 1,
    card_key: "card-1",
    created_at: "2026-11-01T12:00:00Z",
    updated_at: "2026-11-01T12:00:00Z",
  };
  const tables = {
    memberships: [],
    files: [file],
    pieces: video ? [piece] : [],
    tenants: [
      {
        id: tenant,
        name: "Harbor",
        slug: `p${seq}`,
        timezone: "UTC",
        status: "active",
        sending_stopped_at: stopped ? "2026-11-20T00:00:00Z" : null,
      },
    ],
    tenant_config: [],
    google_connections: [],
    posts: [],
  };
  const channel = {
    id: `cccccccc-cccc-4ccc-8ccc-${String(seq).padStart(12, "0")}`,
    tenant_id: tenant,
    kind: "instagram",
    external_id: "17841400000000001",
    status: "active",
    credentials_ref: "ref",
    config: { login: "meta", scopes: ["instagram_basic", "instagram_manage_messages", "instagram_content_publish"] },
    created_at: "2026-11-01T00:00:00Z",
  };
  setServiceClient(
    fakeDb({ tenant_channels: [channel], files: [file], events: [], posts: [], pieces: tables.pieces }, {}, {}),
  );
  const doors = { file_rights_gap: () => rights };
  const ctx = { supabase: fakeDb(tables, {}, doors), userId: USER, email: "ada@example.com", params: {} };
  const tc = { ...newToolContext(ctx, tenant, "owner", "UTC", new Date()), question, askedEarlier: [], language: "en" };
  return buildProposal(tc, "propose_publish", { file: "open-late-on-fridays", places: ["instagram"], ...input });
}

const cardOf = (out) => out.proposal;
/** What the model is told when no card is made: the refusal's own words. */
const saidTo = (out) => {
  const told = String(out.result ?? "");
  try {
    return String(JSON.parse(told).error ?? told);
  } catch {
    return told;
  }
};

test("words that date nothing make the card as before, carrying nothing they are about", async () => {
  const out = await proposed();
  assert.equal(cardOf(out)?.kind, "publish");
  const payload = postPublishOf(cardOf(out).payload);
  assert.equal(payload.about, null);
  assert.deepEqual(payload.facts, []);
});

test("words AI drafts that name a day say which, or that they date nothing; the card carries it to the press", async () => {
  const caption = "Thursday has 3 open chairs.";
  const bare = await proposed({ caption });
  assert.equal(cardOf(bare), null, "no card without what the words are about");
  assert.match(saidTo(bare), /the words say "Thursday": set about\.day/);
  const dated = await proposed({ caption, input: { about: { day: "2099-11-26" } } });
  const payload = postPublishOf(cardOf(dated).payload);
  assert.equal(payload.about.day, "2099-11-26");
  const [call] = [publishSpec.commit(cardOf(dated), { settings: null })].flat();
  assert.equal(call.route, "POST files/[id]/instagram");
  assert.deepEqual(call.body.about, payload.about, "the press is handed what the words are about");
  // A standing day ("open Thursday to Saturday") dates nothing, and AI says so.
  const standing = await proposed({ caption: "Open Thursday to Saturday.", input: { about: { nothing: true } } });
  assert.equal(cardOf(standing)?.kind, "publish");
});

test("an offer in AI's draft says what it is; one the business does not say is refused with what to change", async () => {
  const caption = "20% off every colour this week.";
  assert.match(saidTo(await proposed({ caption })), /the words name "20%": set about\.offer/);
  const unknown = await proposed({ caption, input: { about: { offer: { says: "20% off", until: "2099-11-30" } } } });
  assert.equal(cardOf(unknown), null);
  assert.match(saidTo(unknown), /“20% off” isn't one of your offers\. Add it, or change the words\./);
});

test("a fact is the owner's only in their own words in this question: AI never states one for them", async () => {
  const caption = "20% off every colour this week.";
  const about = { offer: { says: "20% off", until: "2099-11-30" } };
  const invented = await proposed({ caption, input: { about, fact: "20% off still runs all week" } });
  assert.equal(cardOf(invented), null);
  assert.match(saidTo(invented), /fact must be their own words in this question/);
  const said = await proposed({
    caption,
    question: "Post it, and yes the 20% off still runs all week.",
    input: { about, fact: "the 20% off still runs all week" },
  });
  const payload = postPublishOf(cardOf(said).payload);
  assert.deepEqual(payload.facts, [{ says: "the 20% off still runs all week", until: "2099-11-30" }]);
});

test("a person named in it who has not said yes stops the card by name, and the ask is offered", async () => {
  const out = await proposed({ rights: { is: "person", name: "Paola" } });
  assert.equal(cardOf(out), null);
  assert.match(saidTo(out), /Paola hasn't said yes to being in posts\. Ask them, or use another clip\./);
  assert.match(saidTo(out), /keep_yes, action ask/);
});

test("AI paused stops the card, in the words that say how to go on", async () => {
  const out = await proposed({ stopped: true });
  assert.equal(cardOf(out), null);
  assert.match(saidTo(out), /AI is paused\. Resume to post\./);
});

test("a made video goes as a reel, and a picture never does", async () => {
  const reel = await proposed({ video: true, caption: "Calls answered for you." });
  const payload = postPublishOf(cardOf(reel).payload);
  assert.equal(payload.as, "reel");
  const [call] = [publishSpec.commit(cardOf(reel), { settings: null })].flat();
  assert.deepEqual([call.body.as, call.body.caption], ["reel", "Calls answered for you."]);
  assert.match(saidTo(await proposed({ input: { as: "reel" } })), /only a made video goes as a reel/);
  assert.match(saidTo(await proposed({ video: true, input: { places: ["google"] } })), /Google takes a picture/);
});
