/**
 * Ask's eyes on a business's files (decision 0099, step 2): one line every turn, a catalog to choose by, and the pixels by a copy
 * only the edge makes. The real registry runs over a database in memory and an edge that answers from memory. Names go in and ids
 * stay out: a copy's id reaches the request's image blocks and nothing the model reads as words.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
process.env.EDGE_URL ??= "https://edge.example";
process.env.EDGE_CALL_SECRET = "edge-secret-for-this-file";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const sharp = createRequire(path.join(ROOT, "apps/dashboard/package.json"))("sharp");

let edge = async () => new Response("{}", { status: 500 });
let ear = async () => new Response("{}", { status: 500 });
const asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/api/admin/files/copies")) {
    const body = JSON.parse(init.body);
    asked.push(body);
    return edge(body);
  }
  if (url.includes("/api/admin/files/listen")) {
    const body = JSON.parse(init.body);
    asked.push(body);
    return ear(body);
  }
  return realFetch(input, init);
};
after(() => {
  globalThis.fetch = realFetch;
});

const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { resultBlocks } = await import(at("apps/dashboard/src/server/ask/round.ts"));
const { dropFor } = await import(at("apps/dashboard/src/server/ask/refusals.ts"));
const { factsBlock } = await import(at("apps/dashboard/src/server/ask/prompt/stable-system.ts"));
const { fileIndexLineOf, fileWhoSaid, filesLineOf } = await import(at("apps/dashboard/src/server/files/line.ts"));
const { boxShown, zoomSizeOf } = await import(at("packages/contracts/src/files/zoom.ts"));

beforeEach(() => {
  readerCache.clear();
  asked.length = 0;
  setServiceClient(fakeDb({ files: [] }, {}, {}));
});
after(() => setServiceClient(null));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";
const TZ = "America/New_York";
const ID = (n) => `ffffffff-0000-4000-8000-00000000000${n}`;

const row = (n, over = {}) => ({
  id: ID(n),
  tenant_id: A,
  status: "filed",
  source: "upload",
  source_ref: null,
  name: `photo-${n}`,
  mime: "image/jpeg",
  bytes: 1000,
  width: 1200,
  height: 900,
  look: {
    line: "A shopfront at dusk.",
    people: { count: 0, recognizable: 0 },
    text_seen: ["OPEN"],
    quality: { sharp: "good", light: "poor" },
    subject: [0.1, 0.1, 0.9, 0.9],
    colors: ["#112233"],
    issues: [],
    looks_like_stock: false,
  },
  look_status: "done",
  shows: "storefront",
  who_in_it: "not_asked",
  removed_at: null,
  created_at: `2026-11-0${n}T12:00:00Z`,
  updated_at: `2026-11-0${n}T12:00:00Z`,
  ...over,
});

function tool(files, input) {
  const ctx = {
    supabase: fakeDb({ files, memberships: [] }, {}, {}),
    userId: USER,
    email: "ada@example.com",
    params: {},
  };
  const tc = newToolContext(ctx, A, "viewer", TZ, new Date("2026-11-05T12:00:00Z"));
  return runTool(tc, { name: "files", input });
}
const copiesOf = (mapped) =>
  (edge = async ({ ids }) =>
    new Response(JSON.stringify({ ok: true, copies: ids.map((id) => ({ id, file_id: mapped[id] ?? null })) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

test("the line every turn: what is kept and on which shelves, what Ask made apart, what waits, a logo, how fresh", () => {
  const files = [
    { status: "filed", shows: "storefront", created_at: "2026-11-03T15:00:00Z" },
    { status: "filed", shows: "interior", created_at: "2026-11-01T15:00:00Z" },
    { status: "filed", shows: "work", created_at: "2026-11-02T15:00:00Z" },
    { status: "filed", shows: "logo", created_at: "2026-10-30T15:00:00Z" },
    { status: "filed", shows: "graphic", source: "made", created_at: "2026-10-29T15:00:00Z" },
    { status: "inbox", shows: "work", created_at: "2026-11-04T15:00:00Z" },
    { status: "set_aside", shows: "work", created_at: "2026-10-01T15:00:00Z" },
  ];
  assert.equal(
    filesLineOf(files, TZ),
    "Files: 4 photos (place 2, work 1, logos and graphics 1); made by Ask 1; 1 in Inbox; logo yes; last added 4 Nov.",
  );
  assert.equal(filesLineOf([], TZ), "Files: no photos yet.");
  assert.equal(
    filesLineOf([{ status: "inbox", shows: null, created_at: "2026-11-04T15:00:00Z" }], TZ),
    "Files: 0 photos; 1 in Inbox; logo no; last added 4 Nov.",
  );
});

test("the line rides in the facts, and a workspace whose files could not be read says nothing of them", () => {
  const facts = {
    businessName: "Harbor",
    timezone: TZ,
    hoursLines: [],
    closures: [],
    services: [],
    languages: [],
    guardrails: [],
    autonomy: [],
    notes: [],
    bookingNotes: [],
    hasCalendar: false,
    bookingTool: null,
    booksByHand: false,
  };
  assert.match(factsBlock({ ...facts, filesLine: "Files: 3 photos." }), /Files: 3 photos\./);
  assert.doesNotMatch(factsBlock({ ...facts, filesLine: null }), /Files:/);
});

test("who is in it is said as it stands, from the one place that reads a person's word beside the look's", () => {
  const f = (over) => ({ who_in_it: "not_asked", look_status: "done", people: null, ...over });
  assert.equal(fileWhoSaid(f({ people: { count: 0, recognizable: 0 } })), "no people");
  assert.equal(fileWhoSaid(f({ people: { count: 1, recognizable: 0 } })), "1 person, none recognizable");
  assert.equal(fileWhoSaid(f({ people: { count: 2, recognizable: 1 } })), "2 people, not asked");
  assert.equal(
    fileWhoSaid(f({ people: { count: 2, recognizable: 2 }, who_in_it: "agreed" })),
    "2 people, agreed to be shown",
  );
  assert.equal(fileWhoSaid(f({ who_in_it: "no_one" })), "no one in it");
  assert.equal(fileWhoSaid(f({ look_status: "waiting" })), "not looked at yet");
  assert.equal(fileWhoSaid(f({ look_status: "failed" })), "people, not asked");
});

test("a list answers one line a file, to choose by, and only what is kept unless a shelf is asked for", async () => {
  const files = [row(1, { name: "storefront-dusk" }), row(2, { status: "inbox", name: "from-site" })];
  const kept = JSON.parse((await tool(files, { action: "list" })).result);
  assert.deepEqual(kept.files, ["storefront-dusk · place · sharp, poorly lit · no people: A shopfront at dusk."]);
  const inbox = JSON.parse((await tool(files, { action: "list", shelf: "inbox" })).result);
  assert.match(inbox.files[0], /^from-site · inbox/);
});

test("a list finds by what a file shows or has written on it", async () => {
  const files = [
    row(1, { name: "storefront-dusk" }),
    row(2, { name: "bench", look: { line: "Tools on a bench.", text_seen: [] } }),
  ];
  const said = JSON.parse((await tool(files, { action: "list", about: "open dusk" })).result);
  assert.equal(said.files.length, 1);
  assert.match(said.files[0], /^storefront-dusk/);
});

test("a list is read a page at a time, so a long library is reached to its end and no further", async () => {
  const files = Array.from({ length: 45 }, (_, i) =>
    row(1, {
      id: `ffffffff-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: `clip-${String(i).padStart(2, "0")}`,
      created_at: new Date(Date.UTC(2026, 10, 1, 0, 45 - i)).toISOString(),
    }),
  );
  const first = JSON.parse((await tool(files, { action: "list" })).result);
  assert.equal(first.files.length, 40);
  assert.match(first.files[0], /^clip-00 /, "newest first");
  assert.equal(first.more, 5);
  assert.equal(first.next_page, 2);
  const second = JSON.parse((await tool(files, { action: "list", page: 2 })).result);
  assert.equal(second.files.length, 5);
  assert.match(second.files[0], /^clip-40 /);
  assert.equal(second.more, undefined, "the last page says no more");
  assert.equal(second.next_page, undefined);
  const past = JSON.parse((await tool(files, { action: "list", page: 3 })).result);
  assert.match(past.error, /there is no page 3: this list ends on page 2/);
});

test("a look that failed or was refused is said so on its line, so Ask does not take its silence for nothing", () => {
  const base = {
    name: "x",
    status: "filed",
    shows: null,
    who_in_it: "not_asked",
    people: null,
    quality: {},
    line: null,
  };
  assert.match(fileIndexLineOf({ ...base, look_status: "failed" }), /could not be read/);
  assert.match(fileIndexLineOf({ ...base, look_status: "refused" }), /would not be read/);
});

test("get answers the whole note, by a name typed as words, and no copy, fingerprint or address", async () => {
  const files = [row(1, { name: "storefront-dusk", claude_copy: { id: "file_secret" }, fingerprint: "fp" })];
  const out = await tool(files, { action: "get", name: "Storefront dusk" });
  const said = JSON.parse(out.result);
  assert.equal(said.saw, "A shopfront at dusk.");
  assert.deepEqual(said.words_in_it, ["OPEN"]);
  assert.doesNotMatch(out.result, /file_secret|"fp"|fingerprint/);
  const none = await tool(files, { action: "get", name: "nothing-like-it" });
  assert.equal(none.isError, true);
  assert.match(none.result, /no file named/);
});

test("view opens the pictures by a copy's id, and the id reaches the request's image blocks and no words", async () => {
  copiesOf({ [ID(1)]: "file_abc", [ID(2)]: "file_def" });
  const files = [row(1, { name: "storefront-dusk" }), row(2, { name: "bench" })];
  const out = await tool(files, { action: "view", names: ["Storefront dusk", "bench"] });
  assert.equal(out.isError, false);
  assert.deepEqual(asked[0].ids, [ID(1), ID(2)]);
  assert.equal(asked[0].tenant_id, A);
  assert.doesNotMatch(out.result, /file_abc|file_def/, "the words never hold an id");
  assert.deepEqual(out.pictures, [
    { name: "storefront-dusk", id: ID(1), fileId: "file_abc" },
    { name: "bench", id: ID(2), fileId: "file_def" },
  ]);
  const [block] = resultBlocks([{ block: { id: "call-1" }, out }]);
  assert.equal(block.tool_use_id, "call-1");
  assert.deepEqual(block.content.slice(1), [
    { type: "text", text: "The file storefront-dusk:" },
    { type: "image", source: { type: "file", file_id: "file_abc" } },
    { type: "text", text: "The file bench:" },
    { type: "image", source: { type: "file", file_id: "file_def" } },
  ]);
  assert.match(block.content[0].text, /^<record/, "its words are fenced as any read's are");
});

test("a read with no pictures stays the plain string it always was, so what a live chain replays does not move", () => {
  const [block] = resultBlocks([{ block: { id: "c" }, out: { result: "{}", isError: false } }]);
  assert.equal(typeof block.content, "string");
});

test("a name that is no file, and a picture with no copy, are said in words: a turn goes on without them", async () => {
  copiesOf({ [ID(1)]: "file_abc" });
  const files = [row(1, { name: "good" }), row(2, { name: "no-copy" })];
  const out = await tool(files, { action: "view", names: ["good", "no-copy", "gone"] });
  const said = JSON.parse(out.result);
  assert.deepEqual(said.no_such_file, ["gone"]);
  assert.deepEqual(said.could_not_open, ["no-copy"]);
  assert.deepEqual(out.pictures, [{ name: "good", id: ID(1), fileId: "file_abc" }]);
});

test("a picture opened says how their newest post looks, so the next keeps what they settled on; before their first, nothing", async () => {
  copiesOf({ [ID(1)]: "file_abc" });
  const files = [row(1, { name: "good" })];
  const said = async () => JSON.parse((await tool(files, { action: "view", names: ["good"] })).result);
  assert.equal((await said()).last_post, undefined, "no post yet");
  const made = (at, plan, over = {}) => ({
    id: `${at}`,
    tenant_id: A,
    source: "made",
    kind: "image",
    removed_at: null,
    created_at: `2026-11-0${at}T00:00:00Z`,
    made: { from: ID(1), plan },
    ...over,
  });
  setServiceClient(
    fakeDb({
      files: [
        made(1, { voice: "classic", layout: "over", book: false }),
        made(2, { voice: "modern", layout: "band", book: true }),
        made(3, { voice: "classic", layout: "frame", book: false }, { removed_at: "2026-11-04T00:00:00Z" }),
        made(4, { voice: "classic", layout: "left", book: false }, { tenant_id: "another" }),
        { ...made(5, {}), source: "upload" },
        // A video made since is no post: what it keeps is its own plan, and no look to carry on.
        { ...made(6, { shape: "hook_cut", lines: ["I asked for volume"] }), kind: "video" },
      ],
    }),
  );
  readerCache.clear();
  assert.deepEqual((await said()).last_post, { voice: "modern", layout: "band", book: true }, "the newest still here");
});

test("a read of how their last post looks that fails costs the turn nothing", async () => {
  copiesOf({ [ID(1)]: "file_abc" });
  const db = fakeDb({}, {}, {});
  db.from = () => {
    throw new Error("no database");
  };
  setServiceClient(db);
  const out = await tool([row(1, { name: "good" })], { action: "view", names: ["good"] });
  assert.equal(out.isError, false);
  assert.equal(JSON.parse(out.result).last_post, undefined);
  assert.equal(out.pictures.length, 1);
});

test("an edge that can't be reached leaves the turn standing, with the files said as not opened", async () => {
  edge = async () => new Response("no", { status: 503 });
  const out = await tool([row(1, { name: "good" })], { action: "view", names: ["good"] });
  assert.equal(out.isError, false);
  assert.deepEqual(JSON.parse(out.result).could_not_open, ["good"]);
  assert.equal(out.pictures, undefined);
});

test("compare takes exactly two, and asks the edge for nothing else", async () => {
  copiesOf({ [ID(1)]: "file_abc", [ID(2)]: "file_def" });
  const files = [row(1, { name: "one" }), row(2, { name: "two" })];
  assert.equal((await tool(files, { action: "compare", names: ["one", "two"] })).pictures.length, 2);
  asked.length = 0;
  const three = await tool(files, { action: "compare", names: ["one"] });
  assert.equal(three.isError, true);
  assert.equal(asked.length, 0);
});

test("no more than four at once", async () => {
  const out = await tool([row(1)], { action: "view", names: ["a", "b", "c", "d", "e"] });
  assert.equal(out.isError, true);
});

test("a picture a live chain replays that Anthropic no longer holds gives the replay up once, for the words", () => {
  const still = { replay: true, context: true, search: true, format: true, words: true };
  assert.equal(dropFor("404 file_abc: File not found", still), "replay");
  assert.equal(dropFor("400 invalid_request_error: file not found: file_abc", still), "replay");
  assert.equal(dropFor("400 invalid thinking signature", still), "replay");
  assert.equal(dropFor("404 file_abc: File not found", { ...still, replay: false }), null);
  assert.equal(dropFor("500 overloaded", still), null);
});

/* --------------------------------------------------- Ask's eyes: the pixels a picture is shown at, and a box of it */

/** The edge as the real one answers: each copy at its size, and a picture sent up decoded, so its bytes must be a real picture. */
function edgeWithSizes(mapped, size = [1200, 900]) {
  const sent = [];
  edge = async (body) => {
    const copies = (body.ids ?? []).map((id) => ({ id, file_id: mapped[id] ?? null, width: size[0], height: size[1] }));
    const pictures = [];
    for (const p of body.pictures ?? []) {
      const meta = await sharp(Buffer.from(p.bytes, "base64")).metadata();
      sent.push({
        key: p.key,
        mime: p.mime,
        name: p.name,
        format: meta.format,
        width: meta.width,
        height: meta.height,
      });
      pictures.push({ key: p.key, file_id: "file_zoom", width: meta.width, height: meta.height });
    }
    return new Response(JSON.stringify({ ok: true, copies, ...(pictures.length ? { pictures } : {}) }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return sent;
}
// Made when first asked for: a top-level await after the tests are registered would let the root's after() run before the rest register.
let photo = null;
const photoOf = () =>
  (photo ??= sharp({ create: { width: 1200, height: 900, channels: 3, background: "#6b8" } })
    .jpeg()
    .toBuffer());
/** The photo in Storage, as the service reads it for a cut. */
function withPhotoInStorage() {
  const service = fakeDb({ files: [] }, {}, {});
  const downloaded = [];
  service.storage = {
    from: () => ({
      download: async (p, o) => {
        downloaded.push({ path: p, ...o });
        return { data: new Blob([await photoOf()]), error: null };
      },
    }),
  };
  setServiceClient(service);
  return downloaded;
}

test("a picture opened says the pixels it is shown at beside its name, so a box can be named in them", async () => {
  edgeWithSizes({ [ID(1)]: "file_abc" });
  const out = await tool([row(1, { name: "storefront-dusk" })], { action: "view", names: ["storefront-dusk"] });
  assert.deepEqual(out.pictures, [{ name: "storefront-dusk", id: ID(1), fileId: "file_abc", size: [1200, 900] }]);
  assert.deepEqual(JSON.parse(out.result).shown[0].size, [1200, 900]);
  const [block] = resultBlocks([{ block: { id: "c" }, out }]);
  assert.equal(block.content[1].text, "The file storefront-dusk (1200×900):");
});

test("zoom cuts the box named in those pixels from the photo itself, enlarges it to read, and sends it up for the turn", async () => {
  const sent = edgeWithSizes({ [ID(1)]: "file_abc" });
  const downloaded = withPhotoInStorage();
  const out = await tool([row(1, { name: "storefront-dusk" })], {
    action: "zoom",
    name: "Storefront dusk",
    box: [100, 100, 340, 280],
  });
  assert.equal(out.isError, false, out.result);
  assert.deepEqual(JSON.parse(out.result), {
    zoomed: "storefront-dusk",
    box: [100, 100, 340, 280],
    of: [1200, 900],
    shown_as: [960, 720],
  });
  assert.equal(downloaded.length, 1, "the original, read whole");
  assert.equal(downloaded[0].transform, undefined);
  assert.deepEqual(
    sent.map(({ format, width, height, mime }) => ({ format, width, height, mime })),
    [{ format: "jpeg", width: 960, height: 720, mime: "image/jpeg" }],
  );
  assert.deepEqual(out.pictures, [
    {
      name: "storefront-dusk",
      id: ID(1),
      fileId: "file_zoom",
      size: [960, 720],
      zoom: { box: [100, 100, 340, 280], of: [1200, 900] },
    },
  ]);
  const [block] = resultBlocks([{ block: { id: "c" }, out }]);
  assert.equal(
    block.content[1].text,
    "The file storefront-dusk, its box [100, 100, 340, 280] of 1200×900, shown at 960×720:",
  );
  assert.doesNotMatch(out.result, /file_zoom/);
});

test("a HEIC, or a heavy original, is cut from Storage's largest copy instead, which the code can read", async () => {
  edgeWithSizes({ [ID(1)]: "file_abc" });
  const downloaded = withPhotoInStorage();
  const out = await tool([row(1, { name: "phone-shot", mime: "image/heic", bytes: 3_000_000 })], {
    action: "zoom",
    name: "phone-shot",
    box: [0, 0, 600, 450],
  });
  assert.equal(out.isError, false, out.result);
  assert.deepEqual(downloaded[0].transform, { width: 2500, height: 2500, resize: "contain" });
});

test("a box is held to the picture: outside it is refused, a point is widened to a region, and a cut is enlarged to read but never into blur", () => {
  assert.deepEqual(boxShown([-50, 20, 300, 1500], [1200, 900]), [0, 20, 300, 900]);
  assert.match(boxShown([1300, 20, 1400, 50], [1200, 900]).wont, /outside/);
  assert.deepEqual(boxShown([600, 450, 600, 450], [1200, 900]), [592, 442, 608, 458]);
  assert.deepEqual(boxShown([340, 280, 100, 100], [1200, 900]), [100, 100, 340, 280], "corners in either order");
  assert.deepEqual(zoomSizeOf([240, 180]), [960, 720], "small: enlarged, but no more than four times");
  assert.deepEqual(zoomSizeOf([600, 400]), [1000, 667], "enlarged to read");
  assert.deepEqual(zoomSizeOf([3000, 2000]), [1568, 1045], "large: brought down to the size a picture is shown at");
  assert.deepEqual(zoomSizeOf([1200, 900]), [1200, 900], "and one that reads already is left as it is");
});

test("a zoom of a file that is not there, or whose copy the edge can't say the size of, is said in words", async () => {
  copiesOf({ [ID(1)]: "file_abc" });
  withPhotoInStorage();
  const none = await tool([row(1)], { action: "zoom", name: "gone", box: [0, 0, 10, 10] });
  assert.match(JSON.parse(none.result).error, /no file named gone/);
  const unsized = await tool([row(1)], { action: "zoom", name: "photo-1", box: [0, 0, 10, 10] });
  assert.match(JSON.parse(unsized.result).error, /could not be opened/);
  assert.equal(unsized.pictures, undefined);
});

test("get says the photo's size", async () => {
  const out = await tool([row(1)], { action: "get", name: "photo-1" });
  assert.deepEqual(JSON.parse(out.result).size, [1200, 900]);
});

/* -------------------------------------------------------------------------------------------- a video (stage B) -- */

const NO_SOUND = { none: true };
const SAID = {
  words: {
    language: "es",
    voices: 2,
    text: "Hola bienvenidos Gracias",
    cues: [
      { start: 0.2, end: 1.1, voice: 1, text: "Hola bienvenidos" },
      { start: 3, end: 3.5, voice: 2, text: "Gracias" },
    ],
    events: [],
  },
  note: {
    speech: true,
    language: "es",
    voices: [{ voice: 1, tone: "warm", pace: "steady" }],
    music: { present: true, kind: "pop", mood: "bright", tempo: null },
    sounds: [],
    feel: "A friendly welcome.",
    unsure: null,
  },
  heard_by: { words: { model: "gemini-3.5-flash-lite", at: "2026-11-07T00:00:00Z" } },
};
const clip = (n, over = {}) =>
  row(n, {
    name: `salon-tour-${n}`,
    mime: "video/mp4",
    kind: "video",
    width: 1920,
    height: 1080,
    seconds: 24,
    media_status: "ready",
    sound_said: "Spanish, 2 voices, music",
    sound: SAID,
    look: { ...row(n).look, line: "A walk through the salon.", subject: null, poster_at: 4.25 },
    ...over,
  });
const json200 = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("a video opens as its sheet, named a video of its length, with how its frames lie and what was heard after it", async () => {
  edge = async ({ ids }) =>
    json200({ ok: true, copies: ids.map((id) => ({ id, file_id: "file_sheet", width: 2576, height: 1449 })) });
  const out = await tool([clip(1)], { action: "view", names: ["salon-tour-1"] });
  assert.equal(out.isError, false, out.result);
  const [picture] = out.pictures;
  assert.equal(picture.fileId, "file_sheet");
  assert.equal(picture.what, "The file salon-tour-1, a video of 0:24");
  assert.match(picture.after, /^48 frames left to right, top to bottom, one every 0\.5 s/);
  assert.match(picture.after, /What is said, transcribed by another model \(Spanish, 2 voices\):/);
  assert.match(picture.after, /Voice 2: Gracias/);
  assert.match(picture.after, /A friendly welcome\./);
  assert.match(picture.after, /You did not hear this clip yourself/);
  assert.equal(JSON.parse(out.result).shown[0].video, "0:24");
  const [block] = resultBlocks([
    { block: { id: "c" }, out: { result: out.result, isError: false, pictures: out.pictures } },
  ]);
  const blocks = block.content;
  const texts = blocks.filter((b) => b.type === "text").map((b) => b.text);
  assert.ok(texts.includes("The file salon-tour-1, a video of 0:24 (2576×1449):"), "named just before its picture");
  assert.equal(blocks.at(-1).type, "text", "and what was heard after it");
});

test("a video still being prepared, or one that could not be, is not opened, and says which", async () => {
  edge = async ({ ids }) =>
    json200({ ok: true, copies: ids.map((id) => ({ id, file_id: "file_x", width: 10, height: 10 })) });
  const out = await tool([clip(1, { media_status: "processing" }), clip(2, { media_status: "failed" })], {
    action: "view",
    names: ["salon-tour-1", "salon-tour-2"],
  });
  const said = JSON.parse(out.result);
  assert.match(said.not_ready[0], /salon-tour-1 is still being prepared/);
  assert.match(said.not_ready[1], /salon-tour-2 could not be prepared/);
  assert.deepEqual(out.pictures ?? [], []);
  assert.ok(!asked.some((a) => a.ids?.length), "the edge is not asked for what is not ready");
});

test("zoom at a moment opens it whole; with a box, a box of it; from and to, a stretch; each named as what it is", async () => {
  edge = async (body) =>
    json200({
      ok: true,
      copies: [],
      moments: body.moments.map((m) =>
        m.from !== undefined
          ? {
              key: m.key,
              file_id: "file_span",
              width: 2576,
              height: 1100,
              from: m.from,
              to: m.to,
              step: 1.25,
              frames: 24,
            }
          : m.box
            ? { key: m.key, file_id: "file_box", width: 1000, height: 500, box: m.box, of: m.of }
            : { key: m.key, file_id: "file_moment", width: 2576, height: 1449 },
      ),
    });
  const moment = await tool([clip(1)], { action: "zoom", name: "salon-tour-1", at: "0:12" });
  assert.equal(moment.pictures[0].what, "The file salon-tour-1, a video, its frame at 0:12");
  assert.deepEqual(asked.at(-1).moments, [{ key: "one", id: ID(1), at: 12 }]);
  const box = await tool([clip(1)], { action: "zoom", name: "salon-tour-1", at: 12, box: [100, 100, 400, 300] });
  assert.deepEqual(asked.at(-1).moments[0].of, [1920, 1080], "the box is in the pixels the moment was shown at");
  assert.deepEqual(box.pictures[0].zoom, { box: [100, 100, 400, 300], of: [1920, 1080] });
  const span = await tool([clip(1)], { action: "zoom", name: "salon-tour-1", from: "0:10", to: "0:20" });
  assert.equal(span.pictures[0].what, "The file salon-tour-1, a video, from 0:10 to 0:20");
  assert.match(span.pictures[0].after, /^24 frames left to right, top to bottom, one every 1\.25 s/);
});

test("a zoom that asks the wrong thing of a kind is refused in words", async () => {
  edge = async () => json200({ ok: true, copies: [] });
  const ask = async (files, input) => JSON.parse((await tool(files, input)).result).error;
  assert.match(
    await ask([clip(1)], { action: "zoom", name: "salon-tour-1", box: [0, 0, 10, 10] }),
    /open it with zoom at first/,
  );
  assert.match(await ask([clip(1)], { action: "zoom", name: "salon-tour-1" }), /name a moment/);
  assert.match(await ask([clip(1)], { action: "zoom", name: "salon-tour-1", at: "0:40" }), /0:24 long/);
  assert.match(await ask([clip(1)], { action: "zoom", name: "salon-tour-1", at: "soon" }), /M:SS/);
  assert.match(await ask([row(1)], { action: "zoom", name: "photo-1", at: "0:01" }), /is a photo: name a box alone/);
  assert.match(await ask([row(1)], { action: "zoom", name: "photo-1" }), /name the box to cut/);
});

test("listen puts Ask's question to the ear, and its answer comes back fenced as another model's", async () => {
  ear = async () =>
    json200({ ok: true, answer: "The voice sounds sure and warm at 0:20.", model: "gemini-3.5-flash-lite" });
  const out = await tool([clip(1)], {
    action: "listen",
    name: "salon-tour-1",
    question: "Does she sound sure?",
    from: "0:18",
    to: "0:24",
  });
  const said = JSON.parse(out.result);
  assert.match(said.answer, /^An ear's answer, not yours/);
  assert.match(said.answer, /The voice sounds sure and warm at 0:20\./);
  assert.equal(said.heard_by, "gemini-3.5-flash-lite");
  assert.deepEqual(asked.at(-1), { tenant_id: A, id: ID(1), question: "Does she sound sure?", from: 18, to: 24 });
  ear = async () => json200({ ok: true, wont: "the clip has no sound" });
  const quiet = JSON.parse(
    (await tool([clip(1, { sound: NO_SOUND })], { action: "listen", name: "salon-tour-1", question: "q" })).result,
  );
  assert.match(quiet.error, /the clip has no sound/);
  const photo = JSON.parse((await tool([row(1)], { action: "listen", name: "photo-1", question: "q" })).result);
  assert.match(photo.error, /is a photo: it has no sound/);
});

test("get says a video's length and what was heard, the ears' words fenced, and that Ask did not hear it", async () => {
  const said = JSON.parse((await tool([clip(1)], { action: "get", name: "salon-tour-1" })).result);
  assert.equal(said.video, "0:24");
  assert.equal(said.sound, "Spanish, 2 voices, music");
  assert.match(said.what_is_said, /Hola bienvenidos/);
  assert.match(said.how_it_sounds, /A friendly welcome\./);
  assert.deepEqual(said.heard_by, { words: "gemini-3.5-flash-lite" });
  assert.match(said.you, /You did not hear this clip yourself/);
  assert.equal(said.subject, undefined, "a video has no box of its own");
  const none = JSON.parse((await tool([clip(1, { sound: NO_SOUND })], { action: "get", name: "salon-tour-1" })).result);
  assert.equal(none.sound, "it has no sound");
});

test("a list's line says a video's length and its sound, and finds it by what it says", async () => {
  const said = JSON.parse((await tool([clip(1), row(2)], { action: "list", about: "spanish" })).result);
  assert.deepEqual(said.files.length, 1);
  assert.match(said.files[0], /^salon-tour-1 · place · video 0:24 · Spanish, 2 voices, music/);
});

test("a list finds a video by the words spoken in it, and one still being prepared by its name alone", async () => {
  const files = [clip(1), clip(2, { sound: NO_SOUND, sound_said: null }), row(3)];
  const found = JSON.parse((await tool(files, { action: "list", about: "bienvenidos gracias" })).result);
  assert.equal(found.files.length, 1, "every word, in what is said");
  assert.match(found.files[0], /^salon-tour-1 /);
  const none = JSON.parse((await tool(files, { action: "list", about: "bienvenidos adios" })).result);
  assert.deepEqual(none.files, []);
  const waiting = [clip(1, { media_status: "processing", sound: null, sound_said: null })];
  const byName = JSON.parse((await tool(waiting, { action: "list", about: "salon tour" })).result);
  assert.equal(byName.files.length, 1);
});

test("a list finds what is meant: part of a word, without its accents or its capitals, and never by a grammar", async () => {
  const nails = row(1, {
    name: "uñas-acrílicas-rosa",
    look: { ...row(1).look, line: "A set of gel nails, freshly done.", text_seen: ["Salón Bella"] },
  });
  const files = [nails, row(2)];
  const found = async (about) => JSON.parse((await tool(files, { action: "list", about })).result).files.length;
  for (const about of ["nail", "NAILS", "unas acrilicas", "salon", "Salón", "fresh gel", "nails, gel!"])
    assert.equal(await found(about), 1, about);
  assert.equal(await found("nail dusk"), 0, "every word, in the one file");
  assert.equal(await found("lashes or nails"), 0, "or is a word like any other, and no file says it");
  assert.equal(await found("-nails"), 1, "a leading hyphen takes nothing away");
  assert.equal(await found(" , "), 2, "no words, every file");
});

test("a file is opened by its name in any language: read, seen and zoomed by the words its owner gave it", async () => {
  const named = row(1, { name: "uñas-acrílicas-rosa" });
  const got = JSON.parse((await tool([named, row(2)], { action: "get", name: "uñas-acrílicas-rosa" })).result);
  assert.equal(got.name, "uñas-acrílicas-rosa");
  const said = JSON.parse((await tool([named, row(2)], { action: "get", name: "Uñas acrílicas rosa" })).result);
  assert.equal(said.name, "uñas-acrílicas-rosa", "as a person says it, cleaned as a name is");
  const other = JSON.parse((await tool([row(1, { name: "新年-店内" })], { action: "get", name: "新年-店内" })).result);
  assert.equal(other.name, "新年-店内", "no script is left out");
  const none = JSON.parse((await tool([named], { action: "get", name: "unas-acrilicas-rosa" })).result);
  assert.match(none.error, /no file named/, "a name is its own letters: the list is what finds it without them");
});

test("a video says the moment its look chose to stand for it, where it is read and where it is opened", async () => {
  const got = JSON.parse((await tool([clip(1)], { action: "get", name: "salon-tour-1" })).result);
  assert.equal(got.stands_at, "0:04.3");
  edge = async ({ ids }) =>
    json200({ ok: true, copies: ids.map((id) => ({ id, file_id: "file_sheet", width: 2576, height: 1449 })) });
  const opened = JSON.parse((await tool([clip(1)], { action: "view", names: ["salon-tour-1"] })).result);
  assert.equal(opened.shown[0].stands_at, "0:04.3");
  const unlooked = clip(1, { look: null, look_status: "waiting" });
  const before = JSON.parse((await tool([unlooked], { action: "get", name: "salon-tour-1" })).result);
  assert.equal(before.stands_at, undefined, "nothing before its look");
  assert.equal(JSON.parse((await tool([row(2)], { action: "get", name: "photo-2" })).result).stands_at, undefined);
});

test("a video says the moments its look named, best first, with their times, where it is read and where it is opened", async () => {
  const moments = [
    { at: 21.5, what: "the finished colour at the mirror" },
    { at: 1, what: "the before, roots showing" },
    { at: "soon", what: "not a time" },
    { at: 9 },
  ];
  const looked = clip(1, { look: { ...clip(1).look, moments } });
  const got = JSON.parse((await tool([looked], { action: "get", name: "salon-tour-1" })).result);
  assert.deepEqual(got.moments, ["0:21.5 the finished colour at the mirror", "0:01 the before, roots showing"]);
  edge = async ({ ids }) =>
    json200({ ok: true, copies: ids.map((id) => ({ id, file_id: "file_sheet", width: 2576, height: 1449 })) });
  const opened = JSON.parse((await tool([looked], { action: "view", names: ["salon-tour-1"] })).result);
  assert.deepEqual(opened.shown[0].moments, got.moments);
  const older = JSON.parse((await tool([clip(1)], { action: "get", name: "salon-tour-1" })).result);
  assert.equal(older.moments, undefined, "a clip read by the first edition names none until it is read again");
});
