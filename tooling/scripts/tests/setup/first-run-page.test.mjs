/**
 * The first run's page (/start), drawn without a browser: the frame (the rail, the phone's step line, the receptionist
 * card, Finish later, a step already reached opened in place, a failed read and its retry), Your business (Find, the one
 * press that sets the receptionist up, Connect it to Google and its two answers, Your workspace building beside them),
 * Your receptionist (the greeting, walk-ins, How it sounds) and Rehearse (what it reads from, the skip asked once, How it
 * did and the way on). Where it answers and Go live have suites of their own (first-run-channels-page.test.mjs,
 * first-run-golive-page.test.mjs); the world all three draw in is _first-run-world.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TONE_PRESETS,
  FIRST_RUN_HELPERS,
  FIRST_RUN_LANDED_KEY,
  FIRST_RUN_STEPS,
  GOOGLE_CONNECT_LATER,
  RECEPTIONIST_MET,
  REHEARSE_SKIPPED,
} from "@chanlytics/contracts";
import {
  answering,
  asks,
  blank,
  boxOf,
  byTestId,
  flashes,
  fresh,
  googleVerbs,
  mount,
  open,
  optionsOf,
  page,
  pick,
  readyLater,
  replaced,
  saidOf,
  saverWorld,
  setSettings,
  setSetup,
  setupVerbs,
  store,
  surface,
  textOf,
  tick,
  walk,
  went,
  withFacts,
} from "./_first-run-world.mjs";

test("a new workspace opens on its business: the rail says where it is, the step is Check, whose one press sets the receptionist up, and nothing answers yet", () => {
  setSetup(surface(blank));
  const tree = open();
  assert.equal(
    textOf(byTestId(tree, "fr-heading")),
    "Build your receptionist",
    "nothing on Google here: the heading says what its one press does",
  );
  assert.ok(byTestId(tree, "fr-rail-business"), "the step on screen is a button on the rail");
  assert.equal(byTestId(tree, "fr-rail-receptionist"), null, "a step not reached is only its name");
  assert.deepEqual(
    FIRST_RUN_STEPS.map((s) => s.name),
    ["Your business", "Your receptionist", "Rehearse", "Where it answers", "Go live"],
    "five steps (decision 0073)",
  );
  assert.equal(byTestId(tree, "fr-rows"), null, "Check, not Setup's rows");
  assert.equal(
    saidOf(byTestId(tree, "fr-check-make")),
    "It starts with the name Harbor Moving, and you add the rest next.Build my receptionist",
    "the name typed at sign-up, and the step's one coral button",
  );
  assert.equal(textOf(byTestId(tree, "fr-phone-line")), "1 of 5 · Your business");
  const status = byTestId(tree, "fr-card-status");
  assert.equal(textOf(status), "Not answering yet");
  assert.equal(status.props["data-state"], "not_started", "the status is the state pill, toned by Setup's own states");
  assert.equal(byTestId(tree, "fr-back"), null);
  assert.equal(byTestId(tree, "fr-onward"), null);
  assert.equal(store[FIRST_RUN_LANDED_KEY], "1", "being here is the landing: Today does not send this tab back");
});

test("a step already reached opens in place from the rail, and its onward goes on to where the workspace is", () => {
  setSetup(surface(withFacts));
  const tree = open("business");
  assert.equal(
    textOf(byTestId(tree, "fr-heading")),
    "Your business",
    "set up and looked at again: the step's own name",
  );
  assert.ok(byTestId(tree, "fr-rows"), "Setup's own rows, where the step has nothing of its own left to ask");
  assert.equal(textOf(byTestId(tree, "fr-onward")), "Continue", "a step done: its one coral button");
  assert.equal(byTestId(tree, "fr-held"), null, "nothing holds it");
  went.length = 0;
  byTestId(tree, "fr-onward").props.onClick();
  assert.equal(went.at(-1), "start/receptionist", "on to where the workspace is, as a new entry named for its step");
  byTestId(tree, "fr-rail-receptionist").props.onClick();
  assert.equal(went.at(-1), "start/receptionist", "the rail's step too: an entry the browser's Back returns to");
  assert.equal(went.length, 2, "each a pushed entry, so Back walks the steps taken");
  assert.equal(byTestId(tree, "fr-rail-rehearse"), null, "a step not reached yet");
  const meet = open();
  assert.equal(textOf(byTestId(meet, "fr-heading")), "Meet Harbor Moving's receptionist");
  assert.equal(textOf(byTestId(meet, "fr-phone-line")), "2 of 5 · Your receptionist");
  assert.equal(
    textOf(byTestId(meet, "fr-check-reading")),
    "Reading your receptionist…",
    "set up, and the settings read not landed: its rows wait for it",
  );
  byTestId(meet, "fr-back").props.onClick();
  assert.equal(replaced.at(-1), "start/receptionist", "the bare address being left is named for its step first");
  assert.equal(went.at(-1), "start/business", "then Back opens the step before, as a new entry");
});

test("answering already: Go live says what answers, and Open Today goes to Today", async () => {
  setSetup(surface(answering));
  const tree = open();
  assert.equal(byTestId(tree, "first-run").props["data-step"], "live", "calls answering count as met and rehearsed");
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Your receptionist is answering for Harbor Moving");
  assert.ok(byTestId(tree, "fr-youre-live"));
  const onward = byTestId(tree, "fr-onward");
  assert.equal(textOf(onward), "Open Today");
  onward.props.onClick();
  // Open Today switches calls on first (the page awaits Setup's `activate`, here always ready), then goes to Today.
  await tick();
  assert.equal(went.at(-1), "today");
  assert.equal(textOf(byTestId(tree, "fr-card-status")), "Answering", "Live comes after a call came in");
});

test("Finish later leaves for Today", () => {
  setSetup(surface(blank));
  page.param = null;
  fresh();
  byTestId(mount(), "fr-later").props.onClick();
  assert.equal(went.at(-1), "today");
});

test("the card fills in from the settings read once it lands", () => {
  setSetup(surface(withFacts));
  setSettings(
    { config: { brain: { business_name: "Harbor Moving", booking_link: "https://harbor.example/book" } } },
    { facts: { voice_line: { value: null }, kept_line: { value: null }, handoff_number: { value: "+13055550100" } } },
  );
  try {
    page.param = null;
    fresh();
    const tree = mount();
    assert.equal(textOf(byTestId(tree, "fr-card-books")), "Books withharbor.example/book");
    assert.equal(textOf(byTestId(tree, "fr-card-through")), "Puts through to+1 (305) 555-0100");
    assert.equal(textOf(byTestId(tree, "fr-card-open")), "Open—", "hours set but not read yet: a dash, not a guess");
  } finally {
    setSettings(null);
  }
});

test("a failed read says so, and the retry reads again; before the read, Reading your workspace…", () => {
  setSetup(null);
  fresh();
  const failed = mount();
  assert.ok(byTestId(failed, "fr-failed"));
  byTestId(failed, "fr-retry").props.onClick();
  assert.equal(asks.refreshed, 1);
  setSetup(undefined);
  fresh();
  assert.equal(textOf(byTestId(mount(), "fr-reading")), "Reading your workspace…");
});

/* ---- Find: the business step while an owner can link a listing ---- */
const findable = { ...blank, google: { ready: true, places: true, listing: null, connected: false } };
const HARBOR = {
  place_id: "p-harbor",
  name: "Harbor Moving",
  address: "1 Main St, Brooklyn, NY 11201",
  maps_uri: "https://maps.google.com/?cid=1",
  category: "Moving company",
};
const WAREHOUSE = {
  place_id: "p-dock",
  name: "Harbor Moving Warehouse",
  address: null,
  maps_uri: null,
  category: null,
};
/** A Google that answers from a script and remembers what it was asked. */
const googleSays = (answers) => {
  const asked = { find: [], link: [] };
  Object.assign(googleVerbs, {
    find: async (q) => {
      asked.find.push(q ?? null);
      return answers.shift();
    },
    link: async (id) => {
      asked.link.push(id);
      return { ok: true, read: true, message: "" };
    },
  });
  return asked;
};
const found = (candidates, query = "Harbor Moving") => ({ ok: true, candidates, query, fromFacts: true, message: "" });
const findOn = async () => {
  setSetup(surface(findable));
  page.param = null;
  fresh();
  const first = mount();
  await tick();
  return { first, tree: mount() };
};

test("Find: the business step opens on what Google has for the name on record, the best match first and checked", async () => {
  const asked = googleSays([found([HARBOR, WAREHOUSE])]);
  const { first, tree } = await findOn();
  assert.equal(textOf(byTestId(first, "fr-find-reading")), "Looking on Google…", "asked on arrival");
  // The way on is drawn while Google is asked, held, so the foot keeps its shape as the answer lands.
  assert.equal(byTestId(first, "fr-find-yes")?.props.disabled, true, "held until a listing is picked");
  assert.equal(byTestId(tree, "fr-find-yes")?.props.disabled, false, "the best match checked, it can be pressed");
  assert.deepEqual(asked.find, [null], "with the name on record, no words of the owner's");
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Is this Harbor Moving?", "the name typed at sign-up");
  assert.equal(byTestId(tree, "fr-rows"), null, "Find draws in place of the step's rows");
  // The candidates are the kit's choice of a few: an option each, its name (the best match marked) over its line.
  const hits = optionsOf(tree, "fr-find-hits");
  assert.equal(hits.length, 2);
  assert.equal(textOf(hits[0]), "Harbor MovingBest matchMoving company · 1 Main St, Brooklyn, NY 11201");
  assert.match(textOf(hits[1]), /No address on Google/);
  assert.deepEqual(
    hits.map((r) => r.props["aria-checked"]),
    [true, false],
  );
});

test("Find: another one checked, Yes links it, and the page says so, since Find is gone once it is linked", async () => {
  const asked = googleSays([found([HARBOR, WAREHOUSE])]);
  const { tree } = await findOn();
  optionsOf(tree, "fr-find-hits")[1].props.onClick();
  const again = mount();
  const before = flashes.length;
  await byTestId(again, "fr-find-yes").props.onClick();
  assert.deepEqual(asked.link, ["p-dock"]);
  assert.equal(flashes.length, before + 1);
  assert.equal(textOf(flashes.at(-1).msg), "Harbor Moving Warehouse is your listing on Google — read just now.");
});

test("Find: Yes links it, then asks for the receptionist to be set up from what Google says", async () => {
  const asked = googleSays([found([HARBOR])]);
  const { tree } = await findOn();
  const before = asks.receptionist.length;
  await byTestId(tree, "fr-find-yes").props.onClick();
  assert.deepEqual(asked.link, ["p-harbor"]);
  await tick();
  assert.equal(asks.receptionist.length, before + 1, "once, after the link was taken");
});

test("Find: a link refused asks for nothing more", async () => {
  googleSays([found([HARBOR])]);
  googleVerbs.link = async () => ({
    ok: false,
    read: false,
    message: "Google could not read that listing.",
  });
  const { tree } = await findOn();
  const before = asks.receptionist.length;
  await byTestId(tree, "fr-find-yes").props.onClick();
  await tick();
  assert.equal(asks.receptionist.length, before);
});

test("Check with no receptionist: the owner's press asks for it, once while it is out, and a refusal is said in its words", async () => {
  setSetup(surface(blank));
  page.param = null;
  fresh();
  const tree = mount();
  const before = asks.receptionist.length;
  let answer;
  asks.receptionistSays = new Promise((r) => {
    answer = r;
  });
  const press = byTestId(tree, "fr-check-make-press");
  press.props.onClick();
  const busy = byTestId(mount(), "fr-check-make-press");
  assert.equal(busy.props["aria-busy"], true);
  assert.equal(saidOf(busy), "Building…");
  assert.equal(textOf(busy), "Build my receptionistBuilding…", "both words stay drawn, so the press keeps its width");
  busy.props.onClick();
  assert.equal(asks.receptionist.length, before + 1, "a second press while it is out asks for nothing");
  answer({ ok: false, wrote: false, message: "Only an owner can do this." });
  // The press does not hand its promise on (the page lends Check `() => void make()`), so wait for the answer to be taken.
  await tick();
  asks.receptionistSays = null;
  assert.equal(textOf(flashes.at(-1).msg), "Not set up — Only an owner can do this.");
  assert.equal(
    saidOf(byTestId(mount(), "fr-check-make-press")),
    "Build my receptionist",
    "and it can be pressed again",
  );
});

test("Check's rows, on Your receptionist, wait for the settings read, and a read that failed offers its retry", () => {
  setSetup(surface(withFacts));
  page.param = "receptionist";
  const again = [];
  globalThis.window.__refreshSurface = (s) => again.push(s);
  globalThis.window.__surfaceFailed = (page, pane) => page === "admin" && pane === "workspace";
  try {
    fresh();
    const tree = mount();
    assert.ok(byTestId(tree, "fr-check-failed"), "the settings read failed: said, where the rows would be");
    byTestId(tree, "fr-check-retry").props.onClick();
    assert.deepEqual(again, ["settings"], "and its retry reads the settings again");
  } finally {
    delete globalThis.window.__surfaceFailed;
    delete globalThis.window.__refreshSurface;
  }
});

test("Find: nothing found says so, with the search and the way out, and no Yes", async () => {
  googleSays([found([], "Harbor Moving")]);
  const { tree } = await findOn();
  assert.equal(textOf(byTestId(tree, "fr-find-none")), "Nothing on Google for “Harbor Moving”.");
  assert.equal(byTestId(tree, "fr-find-yes"), null);
  assert.ok(byTestId(tree, "fr-find-not"));
});

test("Find: the owner's own words are searched from three letters on", async () => {
  const asked = googleSays([found([]), found([HARBOR], "harbor moving brooklyn")]);
  const { tree } = await findOn();
  boxOf(tree, "fr-find-words").props.onChange({ target: { value: "ha" } });
  let form = null;
  walk(mount(), (n) => {
    if (!form && n.type === "form") form = n;
  });
  form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(asked.find, [null], "two letters are not sent");
  boxOf(mount(), "fr-find-words").props.onChange({ target: { value: "  harbor   moving brooklyn " } });
  walk(mount(), (n) => {
    if (n.type === "form") form = n;
  });
  form.props.onSubmit({ preventDefault() {} });
  await tick();
  assert.deepEqual(asked.find, [null, "harbor moving brooklyn"]);
  assert.match(textOf(mount()), /What Google has for “harbor moving brooklyn”./);
});

test("Find: a search that failed says the server's sentence, and Try again asks again", async () => {
  const asked = googleSays([
    { ok: false, candidates: [], query: "", fromFacts: true, message: "Google could not be searched just now." },
    found([HARBOR]),
  ]);
  const { tree } = await findOn();
  assert.match(textOf(byTestId(tree, "fr-find-failed")), /Google could not be searched just now./);
  await byTestId(tree, "fr-find-retry").props.onClick();
  await tick();
  assert.deepEqual(asked.find, [null, null]);
  assert.ok(byTestId(mount(), "fr-find-yes"));
});

test("Find: not on Google puts Google's row off, the member's own choice", async () => {
  googleSays([found([HARBOR])]);
  const said = [];
  const was = globalThis.window.__setup.later;
  globalThis.window.__setup.later = async (ids, on) => {
    said.push([ids, on]);
    return { ok: true, message: "" };
  };
  try {
    const { tree } = await findOn();
    const before = asks.receptionist.length;
    await byTestId(tree, "fr-find-not").props.onClick();
    assert.deepEqual(said, [["google", { on: true, why: "answer" }]], "an answer: for good at once");
    await tick();
    assert.equal(asks.receptionist.length, before + 1, "and the receptionist is set up with the name typed at sign-up");
  } finally {
    globalThis.window.__setup.later = was;
  }
});

test("Find is for whoever may set the workspace up (an owner, or the partner who brought it: 0012), by the role gate (View-as included): anyone else sees Check, which says an owner sets the receptionist up", async () => {
  const asked = googleSays([found([HARBOR])]);
  const was = globalThis.window.canDo;
  globalThis.window.canDo = (a) => a === "approve" || a === "autonomy"; // an operator, exactly (contracts ROLE_PERMS)
  try {
    setSetup(surface(findable));
    page.param = null;
    fresh();
    const tree = mount();
    assert.equal(byTestId(tree, "fr-find"), null);
    assert.equal(textOf(byTestId(tree, "fr-check-waiting")), "An owner sets up the receptionist here.");
    assert.equal(byTestId(tree, "fr-check-make"), null, "no press to offer");
    assert.equal(textOf(byTestId(tree, "fr-heading")), "Build your receptionist");
    assert.deepEqual(asked.find, [], "and nothing is searched");
  } finally {
    globalThis.window.canDo = was;
  }
});

test("Find it asks for Find by name, even after not on Google; not on Google again goes to the step's own address", async () => {
  googleSays([found([HARBOR])]);
  const putOff = surface(findable, { later: ["google"] });
  setSetup(putOff);
  page.param = null;
  fresh();
  assert.equal(byTestId(mount(), "fr-find"), null, "the plain address: put off, so the step's rows");
  page.param = "find";
  fresh();
  mount();
  await tick();
  const tree = mount();
  assert.ok(byTestId(tree, "fr-find"), "start/find: Find, whatever was said before");
  await byTestId(tree, "fr-find-not").props.onClick();
  assert.equal(replaced.at(-1), "start/business", "and the step's own address after, replaced: the same step");
});

test("Find on a phone: the best match alone until the owner asks for more, and the pages they agree to", async () => {
  googleSays([found([HARBOR, WAREHOUSE])]);
  const { tree } = await findOn();
  const root = byTestId(tree, "fr-find");
  assert.equal(root.props["data-hits"], "true");
  assert.equal(root.props["data-more"], undefined, "the phone's styles show the best match alone");
  byTestId(tree, "fr-find-more").props.onClick();
  const more = mount();
  assert.equal(byTestId(more, "fr-find").props["data-more"], "true");
  assert.equal(byTestId(more, "fr-find-more"), null);
  const links = [];
  walk(more, (n) => {
    if (n.type === "a" && (n.props.href === "/terms" || n.props.href === "/privacy")) links.push(textOf(n));
  });
  assert.deepEqual(links, ["Terms of service", "Privacy policy"]);
});

/* ---- Connect it to Google (decision 0073, R17): after the listing is linked, for an owner who manages the profile ---- */
const LISTING = {
  place_id: "p-harbor",
  name: "Harbor Moving",
  address: "1 Main St, Brooklyn, NY 11201",
  maps_uri: "https://maps.google.com/?cid=1",
  category: "Moving company",
  rating: 4.7,
  review_count: 212,
};
const managed = (over = {}) => ({
  ...withFacts,
  google: { ready: true, places: true, profile: true, listing: LISTING, connected: false, ...over },
});
/** Google's door, remembering where it was sent, and what it came back with (nothing, unless a test says). */
const googleConnects = (t, back = null) => {
  const asked = [];
  const was = { connect: googleVerbs.connect, outcome: googleVerbs.outcome };
  t.after(() => Object.assign(googleVerbs, was));
  Object.assign(googleVerbs, { connect: (o) => asked.push(o ?? null), outcome: () => back });
  return asked;
};
/** Setup's Later, as Setup's own verb shows it (the row put off at once), remembering what was put off. */
const laterShows = (t, dto, answer = { ok: true, message: "" }) => {
  const said = [];
  t.after(() => {
    setupVerbs.later = readyLater;
  });
  setupVerbs.later = async (id, on) => {
    said.push([id, on]);
    if (answer.ok) setSetup(surface(dto, { later: on ? [id] : [] }));
    return answer;
  };
  return said;
};

test("Connect it to Google (canvas 1B·g): what one sign-in brings, said before Google's window, and Connect goes there and back to Your business", (t) => {
  const asked = googleConnects(t);
  setSetup(surface(managed()));
  const tree = open();
  assert.equal(byTestId(tree, "first-run").props["data-step"], "business", "not done until it is answered");
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Do you manage it on Google?");
  assert.match(
    textOf(byTestId(tree, "first-run")),
    /Sign in with the Google account that manages Harbor Moving, and it comes in as you keep it there:/,
  );
  assert.equal(textOf(byTestId(tree, "fr-google-listing")), "Harbor Moving · 4.7 ★ · 212 reviews");
  const ask = textOf(byTestId(tree, "fr-google-connect"));
  for (const brings of FIRST_RUN_HELPERS.words.google.brings) assert.ok(ask.includes(brings), brings);
  assert.match(
    ask,
    /Your receptionist drafts the replies, and nothing is posted until you say so\. Disconnect it any time in Settings\./,
  );
  assert.equal(byTestId(tree, "fr-onward"), null, "its own three ways on, so no page foot");
  // Beside it, the workspace building: each line a fact the page holds.
  const lines = (id) => [
    textOf(byTestId(tree, `fr-building-${id}`)),
    byTestId(tree, `fr-building-${id}`)?.props["data-state"],
  ];
  assert.deepEqual(lines("made"), ["Workspace made · Harbor Moving", "done"]);
  assert.deepEqual(lines("confirm"), ["Your listing, confirmed", "done"]);
  assert.deepEqual(lines("connect"), ["Connect your Business Profile", "ahead"]);
  assert.deepEqual(lines("write"), ["Your receptionist, written", "done"]);
  assert.equal(byTestId(tree, "fr-building-found"), null, "linked: nothing left to search");
  assert.match(textOf(byTestId(tree, "fr-building")), /Until you connect it, it reads only what's public/);
  byTestId(tree, "fr-google-connect-press").props.onClick();
  assert.deepEqual(asked, [{ back: "start" }], "Google's window, and back to the first run's Your business");
});

test("Connect it to Google: Not now keeps the public listing watched, the member's own Later, and goes on; a Later refused stays and says so", async (t) => {
  googleConnects(t);
  const dto = managed();
  const said = laterShows(t, dto);
  setSetup(surface(dto));
  let tree = open();
  went.length = 0;
  await byTestId(tree, "fr-google-not-now").props.onClick();
  assert.deepEqual(said, [[GOOGLE_CONNECT_LATER, { on: true, why: "answer" }]]);
  assert.equal(replaced.at(-1), "start/business", "the bare address being left is named for its step");
  assert.equal(went.at(-1), "start/receptionist", "and on to Your receptionist, a new entry");
  setupVerbs.later = async () => ({ ok: false, message: "Your settings could not be saved." });
  setSetup(surface(dto));
  flashes.length = 0;
  went.length = 0;
  tree = open();
  await byTestId(tree, "fr-google-not-now").props.onClick();
  assert.equal(textOf(flashes.at(-1).msg), "Not saved — Your settings could not be saved.");
  assert.deepEqual(went, [], "still asked");
});

test("Connect it to Google: Someone else manages it says who can add the owner, with another account or the way on without it", async (t) => {
  const asked = googleConnects(t);
  const dto = managed();
  const said = laterShows(t, dto);
  globalThis.window.__ME = { email: "owner@example.com" };
  t.after(() => delete globalThis.window.__ME);
  setSetup(surface(dto));
  let tree = open();
  byTestId(tree, "fr-google-someone").props.onClick();
  tree = mount();
  const who = byTestId(tree, "fr-google-not-manager");
  assert.match(textOf(who), /^Someone else manages it on Google/);
  assert.match(textOf(who), /That account doesn't manage Harbor Moving\. Whoever does can add you in a minute:/);
  assert.match(textOf(who), /In People and access, they add owner@example\.com as an owner or manager\./);
  assert.match(textOf(who), /Until then your receptionist reads your public listing/);
  byTestId(tree, "fr-google-try-another").props.onClick();
  assert.deepEqual(asked, [{ back: "start" }]);
  await byTestId(tree, "fr-google-go-on").props.onClick();
  assert.deepEqual(
    said,
    [[GOOGLE_CONNECT_LATER, { on: true, why: "answer" }]],
    "on without it: the same Later, the public listing watched",
  );
});

test("back from Google: what came in, a line each with where it stands, and Continue goes on", async (t) => {
  googleConnects(t, { outcome: "connected", why: null });
  const reviews = {
    source: "google_reviews",
    state: "done",
    counts: { reviews: 212, unanswered: 9 },
    parts_done: 1,
    parts_total: 1,
    oldest: "2019-04-02T00:00:00Z",
    started_at: "2026-09-07T14:59:00Z",
    finished_at: "2026-09-07T15:00:00Z",
    last_error: null,
    via: "google",
  };
  const profile = {
    source: "google_profile",
    facts: {
      services: [
        { name: "Local moves", price_note: "from $300", duration_min: null },
        { name: "Packing", price_note: null, duration_min: null },
        { name: "Storage", price_note: null, duration_min: null },
      ],
      closed: [],
      rules: [],
      answers: [],
      description: null,
    },
    read_from: null,
    read_at: "2026-09-07T15:00:00Z",
    error: null,
  };
  const dto = {
    ...managed({ connected: true, connection: { google_email: "owner@example.com" } }),
    imports: [reviews],
    reads: [profile],
  };
  setSetup(surface(dto));
  // Google returns to Your business by name (afterGoogle: `start/business`), where the step is done: the summary is drawn.
  // Google's answer is read in an effect, after the first draw, as React draws again once it is kept.
  open("business");
  const tree = mount();
  const back = byTestId(tree, "fr-google-connected");
  assert.match(textOf(back), /^Harbor Moving is connected/);
  assert.match(textOf(back), /Google · owner@example\.com · just now/);
  assert.equal(textOf(byTestId(tree, "fr-google-reviews")), "ReviewsAll 212 · back to 2019 · 9 wait for a replyIn");
  assert.equal(textOf(byTestId(tree, "fr-google-services")), "Services and prices3, for you to check nextIn");
  assert.equal(textOf(byTestId(tree, "fr-google-news")), "New reviewsRead every hour; your bell ringsOn");
  went.length = 0;
  byTestId(tree, "fr-google-continue").props.onClick();
  assert.equal(went.at(-1), "start/receptionist", "on to where the workspace is now");
});

test("back from Google with an account that manages no such place: who can add them; any other refusal is said in Connections' words", (t) => {
  googleConnects(t, { outcome: "error", why: "no_locations" });
  setSetup(surface(managed()));
  open();
  assert.ok(byTestId(mount(), "fr-google-not-manager"), "the account manages no location of this business");
  googleVerbs.outcome = () => ({ outcome: "error", why: "declined" });
  flashes.length = 0;
  open();
  const tree = mount();
  assert.equal(textOf(flashes.at(-1).msg), "Google did not connect: the sign-in was declined.");
  assert.ok(byTestId(tree, "fr-google-connect"), "and the ask stays, to press again");
  googleVerbs.outcome = () => ({ outcome: "error", why: "something_new" });
  open();
  assert.equal(textOf(flashes.at(-1).msg), "Google did not connect. Try again.", "a refusal with no words of its own");
});

test("Your workspace, building, beside Find: searching while Google is asked, then what it found and what waits on the owner", async () => {
  googleSays([found([HARBOR, WAREHOUSE])]);
  setSetup(surface(findable));
  open();
  // Find asks on arrival (its effect): drawn again before Google answers, the line says it is searching.
  const asking = mount();
  assert.deepEqual(
    [textOf(byTestId(asking, "fr-building-found")), byTestId(asking, "fr-building-found").props["data-state"]],
    ["Searching Google", "waiting"],
  );
  assert.deepEqual(
    [textOf(byTestId(asking, "fr-building-confirm")), byTestId(asking, "fr-building-confirm").props["data-state"]],
    ["Confirm your listing", "ahead"],
    "the confirming said as a line to come, so the list keeps its length as Google answers",
  );
  await tick();
  await tick();
  const tree = mount();
  assert.deepEqual(
    ["found", "confirm", "write"].map((id) => textOf(byTestId(tree, `fr-building-${id}`))),
    ["Found on Google · 2 matches", "Waiting for you to confirm it", "Write your receptionist"],
  );
  assert.equal(byTestId(tree, "fr-building-connect"), null, "nothing to connect before a listing is linked");
});

/* ---- Your receptionist (decision 0073, canvas 2): meet it, make it yours ---- */
const brainSettings = (profile = {}) => ({
  config: { brain: { business_name: "Harbor Moving", profile: { phone_voice: "minimax-Grace", ...profile } } },
});
/** Audio that plays at once and remembers what it was asked to play. */
const audioWorld = (t) => {
  const played = [];
  const was = globalThis.Audio;
  t.after(() => {
    globalThis.Audio = was;
  });
  globalThis.Audio = class {
    constructor(src) {
      this.src = src;
      played.push(src);
    }
    play() {
      return Promise.resolve();
    }
    pause() {}
  };
  return played;
};

test("Your receptionist (canvas 2): the greeting every caller hears in the voice chosen, walk-ins kept as a booking rule, and how it sounds one line away", (t) => {
  const saves = saverWorld(t);
  const played = audioWorld(t);
  setSetup(surface(withFacts));
  setSettings(brainSettings());
  t.after(() => setSettings(null));
  let tree = open();
  assert.equal(byTestId(tree, "first-run").props["data-step"], "receptionist");
  const greeting = byTestId(tree, "fr-greeting");
  assert.match(textOf(greeting), /^Greets every caller with“Hi, Harbor Moving\./);
  assert.match(textOf(greeting), /Your own words any time; the automated-assistant line always stays\.$/);
  const hear = byTestId(tree, "fr-greeting-hear");
  assert.equal(textOf(hear), "Hear Grace");
  hear.props.onClick();
  assert.equal(played.length, 1, "the chosen voice's own sample");
  assert.equal(textOf(byTestId(mount(), "fr-greeting-hear")), "Stop");
  // Walk-ins: the owner's answer, saved through the Business tab's one saver as the booking rule it is.
  const W = FIRST_RUN_HELPERS.words.check.walkIns;
  tree = mount();
  assert.match(textOf(byTestId(tree, "fr-walk-ins")), new RegExp(`^${W.label.replace("?", "\\?")}`));
  pick(tree, "fr-walk-ins-pick", W.options.no);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].row, "walk_ins");
  assert.equal(saves[0].said, "Kept.");
  assert.equal(saves[0].change({}, {}).profile.booking_rules.walk_ins, "no");
  // How it sounds: beside the step on a desk, and one line that opens it as a sheet on a phone.
  assert.ok(byTestId(tree, "fr-sounds"), "the panel beside the step");
  const strip = byTestId(tree, "fr-sounds-open");
  assert.equal(textOf(strip), "How it soundsGraceChange");
  assert.equal(sheetOf(tree, "fr-sounds-sheet").props.open, false);
  strip.props.onClick();
  assert.equal(sheetOf(mount(), "fr-sounds-sheet").props.open, true);
  assert.match(textOf(tree), /Next: talk to it as a customer would, then fix what it gets wrong\./);
});

test("How it sounds: a voice picked saves at once and is heard in its sample, the personality writes the tone and says a reply in it, the pace, and the name kept as the box is left", (t) => {
  const saves = saverWorld(t);
  const played = audioWorld(t);
  setSetup(surface(withFacts));
  setSettings(brainSettings({ tone: TONE_PRESETS[0].tone }));
  t.after(() => setSettings(null));
  let tree = open();
  const panel = byTestId(tree, "fr-sounds");
  assert.equal(textOf(byTestId(panel, "fr-sounds-line")), "Grace · Warm");
  assert.equal(byTestId(panel, "fr-voice-grace").props["aria-pressed"], true, "the voice chosen");
  byTestId(panel, "fr-voice-nia").props.onClick();
  assert.equal(saves.at(-1).row, "phone_voice");
  assert.equal(saves.at(-1).said, "Callers hear Nia from their next call.");
  assert.equal(saves.at(-1).change({}, {}).profile.phone_voice, "minimax-Nia");
  byTestId(panel, "fr-voice-hear-nia").props.onClick();
  assert.equal(played.length, 1);
  assert.equal(byTestId(byTestId(mount(), "fr-sounds"), "fr-voice-hear-nia").props["aria-label"], "Stop");
  // The personality: a preset written into the tone, with a reply said in it.
  tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-sounds-sample")), `“${TONE_PRESETS[0].sample}”`);
  pick(byTestId(tree, "fr-sounds"), "fr-sounds-personality", TONE_PRESETS[1].label);
  assert.equal(saves.at(-1).row, "tone");
  assert.equal(saves.at(-1).change({}, {}).profile.tone, TONE_PRESETS[1].tone);
  // The pace: natural is no setting at all.
  pick(byTestId(tree, "fr-sounds"), "fr-sounds-pace", "A bit slower");
  assert.equal(saves.at(-1).change({}, {}).profile.phone_pace, "a_bit_slower");
  pick(byTestId(tree, "fr-sounds"), "fr-sounds-pace", "Natural");
  assert.equal("phone_pace" in saves.at(-1).change({}, { phone_pace: "faster" }).profile, false);
  // The name, kept as the box is left: tidied, and nothing saved where it did not change.
  const before = saves.length;
  boxOf(byTestId(tree, "fr-sounds"), "fr-sounds-name").props.onChange({ target: { value: "  Ava   Marie " } });
  tree = mount();
  boxOf(byTestId(tree, "fr-sounds"), "fr-sounds-name").props.onBlur();
  assert.equal(saves.length, before + 1);
  assert.equal(saves.at(-1).said, "Ava Marie. Kept.");
  assert.equal(saves.at(-1).change({}, {}).profile.assistant_name, "Ava Marie");
});

test("How it sounds: where the business answers in Spanish first and the voice is not native to it, the native voices are offered, one press to use one", (t) => {
  const saves = saverWorld(t);
  setSetup(surface(withFacts));
  setSettings(brainSettings({ phone_voice: "minimax-Tamsin", languages: ["Spanish", "English"] }));
  t.after(() => setSettings(null));
  const tree = open();
  const panel = byTestId(tree, "fr-sounds");
  assert.equal(
    textOf(byTestId(panel, "fr-accent")).replace(/Use Claudia$/, ""),
    "Tamsin speaks Spanish with an accent. Claudia or Alejandro sound native to Spanish-speaking callers.",
  );
  byTestId(panel, "fr-accent-use").props.onClick();
  assert.equal(saves.at(-1).change({}, {}).profile.phone_voice, "minimax-Claudia");
  setSettings(brainSettings({ phone_voice: "minimax-Claudia", languages: ["Spanish"] }));
  assert.equal(byTestId(byTestId(open(), "fr-sounds"), "fr-accent"), null, "a native voice: nothing to suggest");
});

/* ---- Rehearse (decision 0073, canvas 3): talk to it as a customer would, then fix what it gets wrong ---- */
test("Rehearse (canvas 3): talk to it, what it reads from beside, and the skip asked once before it puts the wait off", async (t) => {
  const dto = withFacts;
  setSetup(surface(dto, { later: [RECEPTIONIST_MET] }));
  setSettings(brainSettings({ assistant_name: "Ava" }));
  t.after(() => setSettings(null));
  const said = [];
  t.after(() => {
    setupVerbs.later = readyLater;
  });
  setupVerbs.later = async (id, on) => {
    said.push([id, on]);
    setSetup(surface(dto, { later: [RECEPTIONIST_MET, id] }));
    return { ok: true, message: "" };
  };
  let tree = open();
  assert.equal(byTestId(tree, "first-run").props["data-step"], "rehearse");
  assert.equal(textOf(byTestId(tree, "fr-heading")), "Talk to Ava as a customer would");
  assert.equal(textOf(byTestId(tree, "fr-phone-line")), "3 of 5 · Rehearse");
  assert.equal(byTestId(tree, "fr-onward"), null, "nothing to go on with before a review");
  assert.equal(textOf(byTestId(tree, "fr-rehearse-trained")), "Trained so far: nothing yet.");
  assert.deepEqual(
    chipWords(byTestId(tree, "fr-asks")),
    FIRST_RUN_HELPERS.words.rehearse.asks,
    "questions to try, beside the call",
  );
  assert.match(textOf(byTestId(tree, "fr-using")), /Never in Reports, never in People\.$/);
  // Type instead, and back.
  byTestId(tree, "fr-rehearse-mode").props.onClick();
  tree = mount();
  assert.equal(byTestId(tree, "fr-rehearse").props["data-mode"], "type");
  assert.equal(textOf(byTestId(tree, "fr-rehearse-mode")), "Talk instead");
  // The skip: one nudge first, Stay takes it back, and Skip anyway puts the wait off for this member.
  byTestId(tree, "fr-rehearse-skip-go").props.onClick();
  tree = mount();
  assert.match(textOf(byTestId(tree, "fr-rehearse-skip")), /^Most owners talk to it once\./);
  assert.deepEqual(said, [], "one nudge first");
  byTestId(tree, "fr-rehearse-stay").props.onClick();
  tree = mount();
  assert.equal(textOf(byTestId(tree, "fr-rehearse-skip-go")), "Can't talk right now? Skip for now");
  byTestId(tree, "fr-rehearse-skip-go").props.onClick();
  tree = mount();
  went.length = 0;
  await byTestId(tree, "fr-rehearse-skip-go").props.onClick();
  assert.deepEqual(said, [[REHEARSE_SKIPPED, { on: true, why: "answer" }]]);
  assert.equal(replaced.at(-1), "start/rehearse", "the bare address being left is named for its step");
  assert.equal(went.at(-1), "start/channels", "and on to Where it answers");
});

test("Rehearse stays on screen once its first review lands, says how it did, and Looks good goes on to Where it answers", (t) => {
  const reviewed = { ...withFacts, rehearsal: { reviewed: 1, kept: 2 } };
  setSettings(brainSettings({ assistant_name: "Ava" }));
  t.after(() => setSettings(null));
  setSetup(surface(withFacts, { later: [RECEPTIONIST_MET] }));
  open();
  // The review lands while the owner reads it: the step is done, and the bare address would open Where it answers.
  setSetup(surface(reviewed, { later: [RECEPTIONIST_MET] }));
  const tree = mount();
  assert.equal(byTestId(tree, "first-run").props["data-step"], "rehearse", "not jumped on");
  assert.equal(textOf(byTestId(tree, "fr-heading")), "How Ava did");
  assert.equal(textOf(byTestId(tree, "fr-rehearse-trained")), "Trained: 2 things so far.");
  assert.equal(byTestId(tree, "fr-rehearse-skip"), null, "nothing to skip once it has been heard");
  const onward = byTestId(tree, "fr-onward");
  assert.equal(textOf(onward), "Looks good, go on");
  went.length = 0;
  onward.props.onClick();
  assert.equal(went.at(-1), "start/channels");
});

/** A kit sheet by the test id it is given (it names its own parts by it once open). */
function sheetOf(tree, id) {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.testid === id) hit = n;
  });
  return hit;
}

/** The chips a list draws, by their words. */
function chipWords(list) {
  const out = [];
  walk(list, (n) => {
    if (n.type === "li") out.push(textOf(n));
  });
  return out;
}
