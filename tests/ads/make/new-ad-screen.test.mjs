/**
 * New ad's one screen (the Ads plan's 4.6; surfaces/campaigns/ads/new): what it says in every state, from its own
 * model, and what it holds and asks as it is pressed, from the real sheet on the stub React over a source the test
 * answers by hand. No model is asked and nothing reaches a server: the routes behind the source are
 * new-ad-draft.test.mjs's, and the rules behind each check new-ad-checks.test.mjs's.
 *
 * A made-up business throughout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, all, byTestId, find, textOf, press } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { CONTENT_ROUTE } from "@chanlytics/contracts";
import { dayWord } from "../../../apps/dashboard/src/surfaces/campaigns/ads/model/words.ts";
import { newAdView } from "../../../apps/dashboard/src/surfaces/campaigns/ads/new/model.ts";
import {
  ACCOUNT_FAULT,
  KIND,
  MISSING,
  NEW,
  PICTURE_FAULT,
  PRICE_FAULT,
  WORDS_FAULT,
} from "../../../apps/dashboard/src/surfaces/campaigns/ads/new/words.ts";

installStubReact({ CHANLY: { nav() {} } });
const S = "../../../apps/dashboard/src";
(await import(`${S}/surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const { NewAd } = await import(`${S}/surfaces/campaigns/ads/new/sheet.tsx`);

const FILE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const TODAY = "2031-03-15";
const END = "2031-03-29";

const THREE = [
  { headline: "First appointment", text: "A first appointment at Harbor Studio. Message us on WhatsApp." },
  { headline: "Harbor Studio", text: "First appointments at Harbor Studio. Message us on WhatsApp for a time." },
  { headline: "Ask us", text: "Ask Harbor Studio about a first appointment on WhatsApp." },
];

/** A draft the server answers: a first appointment within five miles, $70 over fourteen days, no words yet. */
const answerOf = (over = {}, draft = {}) => ({
  can: true,
  draft: {
    service: "First appointment",
    picture: { id: FILE, kind: "photo", name: "front desk", made: false },
    miles: 5,
    total_minor: 7000,
    end_day: END,
    versions: [],
    answers: {},
    ...draft,
  },
  today: TODAY,
  days: 14,
  account: { name: "Harbor Studio Ads", currency: "USD", page: "Harbor Studio", min_daily_minor: 500 },
  amount: { starting: true, least_minor: 7000, history: false },
  picked: "most_booked",
  checks: [],
  question: null,
  declared: "none",
  turn_on: "not_yet",
  owner: true,
  ...over,
});
const written = (over = {}, draft = {}) => answerOf(over, { versions: THREE, ...draft });

/** The screen's model over what it holds: written words, nothing typed since, unless a test says otherwise. */
const view = (over = {}) => {
  const answer = over.answer ?? written();
  const { total_minor, miles, end_day, answers } = answer.draft;
  return newAdView({
    answer,
    local: { total_minor, miles, end_day, answers, ...over.typed },
    words: { at: "written" },
    version: 0,
    telling: false,
    told: null,
    need: null,
    sample: false,
    ...over,
  });
};

// ---------------------------------------------------------------------------------------------------------------------
// What the screen says, in every state

test("the sentence is there before any words: the service, the area, the amount and the day, why that amount, and a press that names the most it can cost", () => {
  const vm = view({ answer: answerOf(), words: { at: "writing" } });
  assert.equal(vm.title, "First appointment");
  assert.equal(vm.kicker, "New ad · drafted by AI");
  assert.deepEqual(vm.sentence, { service: "First appointment", miles: "5 miles", amount: "$70", end: dayWord(END) });
  assert.deepEqual(vm.why, [
    "A starting amount. There is no history yet to say what a booking costs.",
    "It offers what people booked most in the last 90 days.",
  ]);
  // The words are on their way: AI is writing, three versions are coming, and the press waits for them.
  assert.equal(vm.shown.waiting, "writing");
  assert.equal(vm.shown.count, "3 versions coming");
  assert.equal(vm.shown.text, null);
  assert.equal(vm.line, null);
  assert.deepEqual(vm.press, { words: "Turn on · up to $70", can: false, under: "Turn on waits for the words." });
  // Who Meta charges, and what the press tells Meta, above it.
  assert.deepEqual(vm.facts, [
    { label: "Meta charges", value: "Harbor Studio Ads · US dollars" },
    { label: "You tell Meta", value: "Not a job, housing, finance, politics or gambling ad" },
  ]);
});

test("written: one of three versions, the next at a press and round again; the ad runs as the Page, with the picture whole", () => {
  const vm = view();
  assert.equal(vm.shown.count, "1 of 3 versions");
  assert.equal(vm.shown.steps, true);
  assert.equal(vm.shown.text, THREE[0].text);
  assert.equal(vm.shown.headline, THREE[0].headline);
  assert.equal(vm.shown.waiting, null);
  assert.equal(view({ version: 1 }).shown.count, "2 of 3 versions");
  assert.equal(view({ version: 3 }).shown.text, THREE[0].text, "after the third comes the first");
  assert.equal(vm.shown.page, "Harbor Studio");
  assert.equal(view({ answer: written({ account: { ...written().account, page: null } }) }).shown.page, "Your Page");
  // The picture is the file as it is kept, never a crop; a piece AI made is Content's own portrait of it.
  assert.deepEqual(vm.shown.picture, {
    src: `/api/v1/files/${FILE}/view?w=720`,
    alt: "Your picture, front desk",
    video: false,
  });
  const made = written({}, { picture: { id: FILE, kind: "video", name: "spring reel", made: true } });
  assert.deepEqual(view({ answer: made }).shown.picture, {
    src: `/api/v1/files/${FILE}/view?shape=portrait`,
    alt: "Your video, spring reel",
    video: true,
  });
});

test("Turn on, until the job that makes an ad exists: grey, and it says nothing is made at Meta and nothing is spent", () => {
  const vm = view();
  assert.equal(vm.line, null, "nothing stops this draft");
  assert.deepEqual(vm.press, {
    words: "Turn on · up to $70",
    can: false,
    under: "Chanlytics can't turn an ad on yet. Nothing is made at Meta, and nothing is spent.",
  });
  // A member who is not the owner is told that first: only the owner turns an ad on.
  assert.equal(view({ answer: written({ owner: false }) }).press.under, "Only the owner can turn an ad on.");
  // On the page's example the press can be pressed, and says it makes nothing.
  const sample = view({ sample: true });
  assert.equal(sample.kicker, "New ad · an example");
  assert.deepEqual(sample.press, {
    words: "Turn on · up to $70",
    can: true,
    under: "This is an example: nothing is made at Meta, and nothing is spent.",
  });
});

test("the amount, the miles and the date follow what is typed at once, and the press follows the amount", () => {
  const vm = view({ typed: { total_minor: 14000, miles: 1, end_day: "2031-03-22" } });
  assert.deepEqual(vm.sentence, {
    service: "First appointment",
    miles: "1 mile",
    amount: "$140",
    end: dayWord("2031-03-22"),
  });
  assert.equal(vm.press.words, "Turn on · up to $140");
  assert.equal(vm.why[0], "About $20 a day for 7 days.");
  assert.equal(vm.hints.amount, "about $20 a day · Meta needs at least $5 a day");
  assert.equal(vm.hints.end, "7 days · Meta needs at least a day");
  assert.deepEqual(vm.units, { now: 140, perUnit: 100 });
  // Where ads have brought enough bookings to lean on, the starting amount says what it is the least for.
  const known = written({ amount: { starting: true, least_minor: 7000, history: true } });
  assert.equal(view({ answer: known }).why[0], "A starting amount: the least Meta takes for 14 days.");
  assert.deepEqual(view({ answer: written({ picked: "first" }) }).why.slice(1), [
    "It offers the first of your Services.",
  ]);
  assert.equal(view({ answer: written({ picked: null }) }).why.length, 1, "a service the owner chose needs no reason");
});

test("couldn't write the words: one calm line with Try again, the amount and the dates kept, and no press", () => {
  const none = (why) => view({ answer: answerOf(), words: { at: "none", why } });
  const vm = none("failed");
  assert.deepEqual(vm.line, {
    is: "line",
    tone: "calm",
    title: "Couldn't write the words",
    body: "Nothing was sent to Meta. The amount and the dates are kept.",
    press: { words: "Try again", act: { kind: "rewrite" } },
    second: null,
  });
  assert.equal(vm.shown.waiting, "none");
  assert.equal(vm.shown.count, "No versions yet");
  assert.deepEqual(vm.press, {
    words: "Turn on · up to $70",
    can: false,
    under: "An ad with no words can't be turned on.",
  });
  assert.equal(vm.sentence.amount, "$70");
  // Where a day's limit or a paused workspace is why, it says when AI writes again; it never names a system.
  assert.match(none("limit").line.body, /AI can write again tomorrow: today's AI limit is reached\.$/);
  assert.match(none("paused").line.body, /AI writes again once this workspace is active\.$/);
  assert.equal(none("checks").line.body, vm.line.body);
  assert.equal(none("other").line.body, vm.line.body);
});

test("a check tripped (5.1): the first of them as one line with its one act, and the press waits for it", () => {
  const lineOf = (checks, over = {}) => view({ answer: written({ checks }), ...over });
  /** Each check, the line it says and the one press it offers. */
  const rows = [
    [
      { code: "words", fault: "about_reader" },
      WORDS_FAULT.about_reader.title,
      "Let AI rewrite it",
      { kind: "rewrite" },
    ],
    [
      { code: "words", fault: "sure_result" },
      "The words promise a sure result",
      "Let AI rewrite it",
      { kind: "rewrite" },
    ],
    [{ code: "price", fault: "never" }, PRICE_FAULT.never.title, "Take the price out", { kind: "no_price" }],
    [{ code: "price", fault: "differs" }, PRICE_FAULT.differs.title, "Take the price out", { kind: "no_price" }],
    [
      { code: "picture", fault: "person" },
      PICTURE_FAULT.person.title,
      "Use the next picture",
      { kind: "next_picture" },
    ],
    [{ code: "picture", fault: "music" }, "This video has music", "Use the next picture", { kind: "next_picture" }],
    [{ code: "picture", fault: "shape" }, PICTURE_FAULT.shape.title, "Use the next picture", { kind: "next_picture" }],
    [
      { code: "amount", fault: "under_least", nearest_minor: 7000 },
      "Meta takes at least $70 for 14 days",
      "Use $70",
      { kind: "amount", minor: 7000 },
    ],
    [
      { code: "amount", fault: "over_most", nearest_minor: 5000 },
      "That is over the most you said, $50",
      "Use $50",
      { kind: "amount", minor: 5000 },
    ],
    [
      { code: "amount", fault: "not_whole", nearest_minor: 7100 },
      "The amount is a whole number",
      "Use $71",
      { kind: "amount", minor: 7100 },
    ],
    [
      { code: "end", nearest_day: "2031-03-16" },
      "An ad runs at least a day",
      `Use ${dayWord("2031-03-16")}`,
      { kind: "end", day: "2031-03-16" },
    ],
    [
      { code: "area", nearest_miles: 50 },
      "The area is from 1 to 50 miles",
      "Use 50 miles",
      { kind: "miles", miles: 50 },
    ],
  ];
  for (const [check, title, words, act] of rows) {
    const vm = lineOf([check]);
    assert.equal(vm.line.tone, "warn", title);
    assert.equal(vm.line.title, title);
    assert.deepEqual(vm.line.press, { words, act }, title);
    assert.equal(vm.line.second, null, `${title}: one act`);
    assert.deepEqual(
      [vm.press.can, vm.press.under],
      [false, "Turn on waits for the one thing above."],
      `${title}: the press waits`,
    );
  }
  // Several at once: only the first is said.
  const two = lineOf([
    { code: "picture", fault: "person" },
    { code: "words", fault: "about_reader" },
  ]);
  assert.equal(two.line.title, PICTURE_FAULT.person.title);
  // The ad account's own need is the card's line, drawn as the card draws it; with no card read yet, its plain words.
  const need = { title: "Add a payment method at Meta", body: "", act: null };
  assert.deepEqual(lineOf([{ code: "account", check: "payment" }], { need }).line, { is: "account", need });
  const plain = lineOf([{ code: "account", check: "payment" }]).line;
  assert.equal(plain.title, ACCOUNT_FAULT.payment.title);
  assert.equal(plain.press, null);
});

test("the special-kind question (G7): two answers that weigh the same; a yes is not run here and offers Open Meta; the owner's own answer counts at once", () => {
  const asks = written({ question: "housing", declared: "waiting" });
  const vm = view({ answer: asks });
  assert.equal(vm.line.tone, "warn");
  assert.equal(vm.line.title, "Is this ad offering a home to rent or buy?");
  assert.equal(vm.line.body, "Meta has its own rules for these ads. AI couldn't tell from “First appointment”.");
  assert.deepEqual(vm.line.press, {
    words: "No, a service",
    act: { kind: "answer", about: "housing", answer: "no" },
  });
  assert.deepEqual(vm.line.second, {
    words: "Yes, a home",
    act: { kind: "answer", about: "housing", answer: "yes" },
  });
  assert.equal(vm.press.under, "Turn on waits for your answer.");
  assert.equal(vm.facts[1].value, "Waiting for your answer");

  // Answered no, before the server has judged it: the question is gone, and nothing is told to Meta as a special kind.
  const no = view({ answer: asks, typed: { answers: { housing: "no" } } });
  assert.equal(no.line, null);
  assert.equal(no.facts[1].value, NEW.facts.none);

  // Answered yes: such an ad is made in Meta, where its own rules apply. One act opens Meta; a quiet one takes it back.
  for (const yes of [
    view({ answer: asks, typed: { answers: { housing: "yes" } } }),
    view({ answer: written({ declared: "housing" }, { answers: { housing: "yes" } }) }),
  ]) {
    assert.equal(yes.line.tone, "calm");
    assert.equal(yes.line.title, "A housing ad is made in Meta");
    assert.equal(yes.line.body, "Meta takes away the area and age choices this draft rests on. Nothing was made here.");
    assert.equal(yes.line.press.words, "Open Meta");
    assert.equal(yes.line.press.act.kind, "meta");
    assert.match(yes.line.press.act.href, /^https:\/\/(www|adsmanager)\.facebook\.com\//);
    assert.deepEqual(yes.line.second, {
      words: "It isn't a housing ad",
      act: { kind: "answer", about: "housing", answer: "no" },
    });
    assert.deepEqual([yes.press.can, yes.press.under], [false, "A housing ad can't be turned on here."]);
    assert.equal(yes.facts[1].value, "A housing ad");
  }
  // Taken back: the line goes at once.
  const back = view({
    answer: written({ declared: "housing" }, { answers: { housing: "yes" } }),
    typed: { answers: { housing: "no" } },
  });
  assert.equal(back.line, null);
  // Every kind Meta asks about has its question, its two answers and its name.
  for (const kind of ["employment", "housing", "financial", "politics", "gambling"]) {
    const asked = view({ answer: written({ question: kind, declared: "waiting" }) });
    assert.equal(asked.line.title, KIND[kind].ask);
    assert.match(asked.line.title, /\?$/);
  }
});

test("Tell AI what to change: what the last one came to, in one quiet sentence", () => {
  const status = (over) => view(over).tell.status;
  assert.equal(view().tell.status, null);
  assert.deepEqual(view({ telling: true }).tell, { busy: true, status: "AI is changing it…" });
  assert.equal(status({ told: { kind: "changed", what: "words" } }), "AI changed the words.");
  assert.equal(status({ told: { kind: "changed", what: "amount" } }), "AI changed the amount.");
  assert.equal(
    status({ told: { kind: "changed", what: "service" } }),
    "AI changed the service. Its words are being written.",
  );
  // Anything outside the closed list changes nothing, and says what AI can change.
  assert.equal(
    status({ told: { kind: "none", fault: null } }),
    "AI can change the service, the words, the picture, the area, the amount or the end date. Nothing was changed.",
  );
  // Words Meta would turn down are not made: it says which rule, in the product's words.
  assert.equal(
    status({ told: { kind: "none", fault: "about_reader" } }),
    "That would speak about the person reading, and Meta turns that down. Nothing was changed.",
  );
  assert.equal(status({ told: { kind: "failed" } }), "AI didn't answer. Nothing was changed. Try again.");
  assert.equal(status({ told: { kind: "none", fault: null }, sample: true }), NEW.tell.sample);
});

// ---------------------------------------------------------------------------------------------------------------------
// What the screen holds and asks, as it is pressed

let worlds = 0;
/** Where a tab's storage keeps the n-th world's draft. */
const storedAt = (n) => `ads-new-draft:/w/screen-${n}:live`;
/**
 * New ad open in a tab of its own, over a source the test answers by hand: every ask waits in `asks` until the test
 * lands it. `same` opens it again in the tab a world before it used.
 */
function world({ same = false, stored = null } = {}) {
  if (!same) worlds += 1;
  globalThis.location.pathname = `/w/screen-${worlds}/campaigns/ads`;
  if (stored !== null) globalThis.sessionStorage.setItem(storedAt(worlds), stored);
  fresh();
  const asks = [];
  const ask = (kind) => (body) => new Promise((resolve) => asks.push({ kind, body, land: resolve }));
  const went = [];
  const props = {
    open: true,
    source: { sample: false, draft: ask("draft"), words: ask("words") },
    need: null,
    onClose: () => went.push("closed"),
    onConnect() {},
    onGo: (route) => went.push(route),
    onTurnOn() {},
  };
  NewAd(props);
  const draw = () => again(() => NewAd(props));
  const said = (id) => {
    const node = byTestId(draw(), id);
    return node ? textOf(node) : null;
  };
  /** Wait for the n-th ask, and hand it over. */
  const asked = async (n, what) => {
    await until(() => asks.length >= n, what);
    return asks[n - 1];
  };
  const shows = (id, what) => until(() => byTestId(draw(), id) !== null, what);
  return { asks, went, draw, said, asked, shows };
}
/** Type into one of the screen's boxes. */
const typeInto = (tree, id, value) => {
  const boxes = all(tree, (n) => n.props?.["data-testid"] === id);
  const box = boxes.find((n) => typeof n.props.onValueChange === "function") ?? boxes.find((n) => n.props.onChange);
  assert.ok(box, `a box ${id}`);
  if (box.props.onValueChange) box.props.onValueChange(value);
  else box.props.onChange({ target: { value } });
};
const wrote = (over = {}, draft = {}) => ({ ...written(over, draft), wrote: { ok: true } });

test("opened: the sentence the moment the draft answers, AI writing under it, then the three versions; the writer is asked once", async () => {
  const w = world();
  assert.deepEqual(
    w.asks.map((one) => [one.kind, one.body]),
    [["draft", {}]],
  );
  assert.equal(w.said("ads-new-body"), null, "nothing is drawn of a draft before the server answers");
  w.asks[0].land(answerOf());
  const writer = await w.asked(2, "the ad writer to be asked");
  assert.equal(writer.kind, "words");
  assert.equal(writer.body.job, "write");
  assert.deepEqual(writer.body.draft, {
    service: "First appointment",
    picture: FILE,
    versions: [],
    total_minor: 7000,
    miles: 5,
    end_day: END,
    answers: {},
  });
  // The sentence stands with the words still out.
  assert.match(w.said("ads-sentence"), /Show First appointment to people within 5 miles/);
  assert.match(w.said("ads-sentence"), /up to \$70 until /);
  assert.match(w.said("ads-new-writing"), /AI is writing…/);
  assert.equal(byTestId(w.draw(), "ads-new-turn-on").props.disabled, true);
  assert.equal(w.said("ads-new-under"), "Turn on waits for the words.");

  writer.land(wrote());
  await w.shows("ads-new-text", "the words to land");
  assert.equal(w.said("ads-new-text"), THREE[0].text);
  // The count is the press that shows the next.
  assert.match(w.said("ads-new-next"), /^1 of 3 versions/);
  press(byTestId(w.draw(), "ads-new-next"));
  assert.match(w.said("ads-new-next"), /^2 of 3 versions/);
  assert.equal(w.said("ads-new-text"), THREE[1].text);
  assert.equal(w.asks.length, 2, "one draft, one ask of the writer");
  // It says that Chanlytics drew it, and that the picture is whole.
  assert.match(w.said("ads-new-shown"), /Drawn by Chanlytics, not Meta's own preview/);
});

test("a word tapped is changed in place, the press follows as it is typed, and an answer on its way never undoes the typing", async () => {
  const w = world();
  w.asks[0].land(written());
  await w.shows("ads-new-text", "a written draft to open");
  assert.equal(w.asks.length, 1, "a draft that came with its words asks no writer");
  press(byTestId(w.draw(), "ads-chip-amount"));
  typeInto(w.draw(), "ads-new-amount", "9");
  assert.equal(w.said("ads-new-turn-on"), "Turn on · up to $9");
  assert.match(w.said("ads-sentence"), /up to \$9 until /);
  // A moment after the typing stops, the draft is judged as typed.
  const first = await w.asked(2, "the draft to be judged after typing");
  assert.equal(first.kind, "draft");
  assert.equal(first.body.draft.total_minor, 900);
  assert.equal(first.body.draft.versions.length, 3, "its words go with it, so they are judged too");
  // The owner types on while that answer is on its way: it lands, and what they typed stays.
  typeInto(w.draw(), "ads-new-amount", "90");
  first.land(
    written({ checks: [{ code: "amount", fault: "under_least", nearest_minor: 7000 }] }, { total_minor: 900 }),
  );
  await w.shows("ads-new-line", "the judged draft's line");
  assert.equal(w.said("ads-new-turn-on"), "Turn on · up to $90", "REGRESSION: a late answer put the old amount back");
  const second = await w.asked(3, "the last of the typing to be judged");
  assert.equal(second.body.draft.total_minor, 9000);
  // Its line's one act sets the amount Meta takes, and that is judged at once... as typing is.
  assert.match(w.said("ads-new-line"), /Meta takes at least \$70 for 14 days/);
  press(byTestId(w.draw(), "ads-new-line-act"));
  assert.equal(w.said("ads-new-turn-on"), "Turn on · up to $70");
});

test("the question answered while AI writes: it goes at once, the words still land, and the draft is judged with the answer", async () => {
  const w = world();
  w.asks[0].land(answerOf({ question: "housing", declared: "waiting" }));
  const writer = await w.asked(2, "the ad writer to be asked");
  assert.match(w.said("ads-new-line"), /Is this ad offering a home to rent or buy\?/);
  press(byTestId(w.draw(), "ads-new-line-act"));
  assert.equal(w.said("ads-new-line"), null, "answered: not asked again");
  assert.match(w.said("ads-new-writing"), /AI is writing…/);
  assert.equal(w.asks.length, 2, "the writer is not overtaken: its answer is still this draft's");

  // The writer's answer was sent before the answer: it brings the question back, and the owner's answer stands.
  writer.land(wrote({ question: "housing", declared: "waiting" }));
  await w.shows("ads-new-text", "REGRESSION: the screen stayed on AI is writing");
  assert.equal(w.said("ads-new-line"), null);
  const judged = await w.asked(3, "the draft to be judged with the answer");
  assert.equal(judged.kind, "draft");
  assert.deepEqual(judged.body.draft.answers, { housing: "no" });
  assert.equal(judged.body.draft.versions.length, 3);
  judged.land(written({}, { answers: { housing: "no" } }));
  await until(() => w.asks.length === 3 && w.said("ads-new-text") !== null, "the judged draft to show");
  assert.equal(w.said("ads-new-line"), null);
  assert.match(w.said("ads-new-facts"), /Not a job, housing, finance, politics or gambling ad/);
});

test("another picture while AI writes: the writer is asked again for the draft as it now is, so its words still come", async () => {
  const w = world();
  w.asks[0].land(answerOf({ checks: [{ code: "picture", fault: "shape" }] }));
  const overtaken = await w.asked(2, "the ad writer to be asked");
  assert.match(w.said("ads-new-line"), /wrong shape for the feed/);
  press(byTestId(w.draw(), "ads-new-line-act"));
  const next = await w.asked(3, "the next picture to be asked for");
  assert.deepEqual([next.kind, next.body.act], ["draft", "next_picture"]);
  // The words written for the picture it no longer shows are not shown.
  overtaken.land(wrote());
  next.land(answerOf({}, { picture: { id: OTHER, kind: "photo", name: "window", made: false } }));
  const again2 = await w.asked(4, "REGRESSION: no writer was asked, and the screen stayed on AI is writing");
  assert.equal(again2.kind, "words");
  assert.equal(again2.body.draft.picture, OTHER);
  assert.equal(w.said("ads-new-text"), null);
  again2.land(wrote({}, { picture: { id: OTHER, kind: "photo", name: "window", made: false } }));
  await w.shows("ads-new-text", "the words to land");
  assert.equal(w.said("ads-new-line"), null);
});

test("couldn't write the words: asked once more where they failed the checks, then one line with Try again, which asks again", async () => {
  const w = world();
  w.asks[0].land(answerOf());
  const failed = { ...answerOf(), wrote: { ok: false, why: "checks" } };
  (await w.asked(2, "the ad writer to be asked")).land(failed);
  (await w.asked(3, "the writer to be asked once more")).land(failed);
  await w.shows("ads-new-line", "the screen to say it couldn't");
  assert.match(w.said("ads-new-line"), /Couldn't write the words/);
  assert.match(w.said("ads-new-line"), /Nothing was sent to Meta\. The amount and the dates are kept\./);
  assert.equal(w.said("ads-new-under"), "An ad with no words can't be turned on.");
  assert.equal(w.asks.length, 3, "and not a third time by itself");
  assert.equal(w.said("ads-new-line-act"), "Try again");
  press(byTestId(w.draw(), "ads-new-line-act"));
  const retry = await w.asked(4, "Try again to ask the writer");
  assert.equal(retry.body.job, "write");
  assert.match(w.said("ads-new-writing"), /AI is writing…/);
  // An answer that never came is said the same way; a day's limit is not asked for twice.
  const quiet = world();
  quiet.asks[0].land(answerOf());
  (await quiet.asked(2, "the ad writer to be asked")).land(null);
  await quiet.shows("ads-new-line", "the screen to say it couldn't");
  assert.match(quiet.said("ads-new-line"), /Couldn't write the words/);
  const limit = world();
  limit.asks[0].land(answerOf());
  (await limit.asked(2, "the ad writer to be asked")).land({ ...answerOf(), wrote: { ok: false, why: "limit" } });
  await limit.shows("ads-new-line", "the screen to say it couldn't");
  assert.match(limit.said("ads-new-line"), /AI can write again tomorrow/);
  assert.equal(limit.asks.length, 2);
});

test("+ New where a draft can't be written (G13): the one thing missing, and the press that opens it", async () => {
  /** Each thing missing, and where its press goes. */
  const doors = {
    service: "admin/business",
    address: "admin/business",
    whatsapp: "admin/integrations",
    picture: CONTENT_ROUTE,
    account: "closed",
    stopped: "closed",
  };
  for (const [missing, door] of Object.entries(doors)) {
    const w = world();
    w.asks[0].land({ can: false, missing });
    await w.shows("ads-new-short", `${missing} to be said`);
    assert.match(w.said("ads-new-short"), new RegExp(MISSING[missing].title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(byTestId(w.draw(), "ads-new-body"), null, `${missing}: no draft is drawn`);
    assert.equal(w.said("ads-new-missing-act"), MISSING[missing].act);
    press(byTestId(w.draw(), "ads-new-missing-act"));
    assert.deepEqual(w.went, [door], missing);
    assert.equal(w.asks.length, 1, `${missing}: no writer is asked`);
  }
  // An ad account still being read asks for nothing: its press looks again.
  const reading = world();
  reading.asks[0].land({ can: false, missing: "account_reading" });
  await reading.shows("ads-new-short", "the reading to be said");
  assert.match(reading.said("ads-new-short"), /Nothing is needed from you\./);
  press(byTestId(reading.draw(), "ads-new-missing-act"));
  assert.deepEqual((await reading.asked(2, "the draft to be read again")).body, {});
  // No answer at all: it says so in its own words, and reads again at a press.
  const none = world();
  none.asks[0].land(null);
  await none.shows("ads-new-again", "the failure to be said");
  assert.match(none.said("ads-new-short"), /Couldn't open New ad/);
  press(byTestId(none.draw(), "ads-new-again"));
  assert.deepEqual((await none.asked(2, "the draft to be read again")).body, {});
});

test("closed and opened again in the tab: the same draft and its words, judged again, and the writer is not asked twice (G18)", async () => {
  const first = world();
  first.asks[0].land(answerOf());
  (await first.asked(2, "the ad writer to be asked")).land(wrote());
  await first.shows("ads-new-text", "the words to land");

  const back = world({ same: true });
  assert.equal(back.said("ads-new-text"), THREE[0].text, "its words are there at once");
  assert.equal(back.asks.length, 1);
  assert.equal(back.asks[0].kind, "draft", "judged again as the business now stands");
  assert.equal(back.asks[0].body.draft.versions.length, 3);
  back.asks[0].land(written());
  await until(() => back.said("ads-new-text") !== null, "the judged draft to show");
  assert.equal(
    back.asks.some((one) => one.kind === "words"),
    false,
  );
});

test("the page loaded again: the tab's own storage still holds the draft and its words; one kept in another shape is let go", async () => {
  const first = world();
  first.asks[0].land(answerOf());
  (await first.asked(2, "the ad writer to be asked")).land(wrote());
  await first.shows("ads-new-text", "the words to land");
  const stored = globalThis.sessionStorage.getItem(storedAt(worlds));
  assert.ok(stored, "the draft is in the tab's storage as well");

  // A page that has only the storage to read from, as one loaded again has.
  const loaded = world({ stored });
  assert.equal(loaded.said("ads-new-text"), THREE[0].text, "its words are there at once");
  assert.deepEqual(
    loaded.asks.map((one) => [one.kind, one.body.draft?.versions.length]),
    [["draft", 3]],
    "judged again, and no writer asked",
  );
  // Kept in a shape this screen no longer reads: let go, and a fresh draft is asked for.
  const old = world({ stored: JSON.stringify({ shape: 0, held: JSON.parse(stored).held }) });
  assert.equal(old.said("ads-new-body"), null);
  assert.deepEqual(old.asks[0].body, {});
  const junk = world({ stored: "not a draft" });
  assert.deepEqual(junk.asks[0].body, {});
});

test("Tell AI what to change: one line to AI, the one change it made shown, and a change Meta would turn down not made", async () => {
  const w = world();
  w.asks[0].land(written());
  await w.shows("ads-new-text", "a written draft to open");
  const tell = (words) => {
    typeInto(w.draw(), "ads-new-tell-box", words);
    find(w.draw(), (n) => n.props?.["data-testid"] === "ads-new-tell" && n.props.onSubmit).props.onSubmit({
      preventDefault() {},
    });
  };
  tell("make it $100");
  const change = await w.asked(2, "AI to be told");
  assert.deepEqual([change.kind, change.body.job, change.body.asked], ["words", "change", "make it $100"]);
  assert.equal(w.said("ads-new-told"), "AI is changing it…");
  change.land({ ...written({}, { total_minor: 10000 }), changed: { kind: "amount" } });
  await until(() => w.said("ads-new-told") === "AI changed the amount.", "what AI changed to be said");
  assert.equal(w.said("ads-new-turn-on"), "Turn on · up to $100");

  tell("say it fixes your back pain");
  const refused = await w.asked(3, "AI to be told again");
  refused.land({ ...written({}, { total_minor: 10000 }), changed: { kind: "none", fault: "about_reader" } });
  await until(() => /Nothing was changed/.test(w.said("ads-new-told") ?? ""), "the refusal to be said");
  assert.equal(
    w.said("ads-new-told"),
    "That would speak about the person reading, and Meta turns that down. Nothing was changed.",
  );
  assert.equal(w.said("ads-new-text"), THREE[0].text);
});
