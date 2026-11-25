/**
 * A tab holds one file of each stylesheet's ladder (apps/dashboard/src/styles/sheet-ladders.ts).
 *
 * A stylesheet is written as nested files, the narrowest a page can link first. A tab that opened one page and warmed
 * the rest held seven stylesheets as a narrow file and a wide one, 184 KB of rules twice (25 Nov 2026). Run here over a
 * document of the test's own, whose links say whether they have loaded and can be taken out:
 *
 * - a warm brings no file its ladder holds already, nor one a wider file there holds;
 * - a page links the widest file holding its own that has loaded, else one a warm is still bringing, else its own;
 * - a narrower file is taken out once a wider one has loaded and it has too, never while it is still on its way, and
 *   that is done a task after a link's load, once every listener has heard it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { heldFrom, keepOneOfEach, linkFor } from "../../../apps/dashboard/src/styles/sheet-ladders.ts";

/** A document of stylesheet links, each `[href, loaded]`, that hears a load on its way down and lets a link be taken out. */
function documentOf(...held) {
  const listening = new Map();
  const doc = {
    links: [],
    querySelectorAll: () => [...doc.links],
    addEventListener: (type, listener, capture) => listening.set(`${type}:${capture}`, listener),
    removeEventListener: (type, listener, capture) => {
      if (listening.get(`${type}:${capture}`) === listener) listening.delete(`${type}:${capture}`);
    },
    /** A link put in, loaded or not. */
    put(href, loaded) {
      const link = {
        localName: "link",
        sheet: loaded ? {} : null,
        getAttribute: (name) => (name === "href" ? href : null),
        remove: () => void (doc.links = doc.links.filter((one) => one !== link)),
      };
      doc.links.push(link);
      return link;
    },
    /** A link's load, as the document hears it on the way down. */
    loads(link) {
      link.sheet = {};
      listening.get("load:true")?.({ target: link });
    },
    hears: () => listening.has("load:true"),
    hrefs: () => doc.links.map((link) => link.getAttribute("href")),
  };
  for (const [href, loaded] of held) doc.put(href, loaded);
  return doc;
}

/** A ladder of a stylesheet's files, the narrowest first, under one name. */
const ladderOf = (name, rungs) =>
  Array.from({ length: rungs }, (_, rung) => ({ href: `/sheets/${name}-${rung + 1}.css`, slot: `${name}${rung}` }));

test("a warm brings nothing its ladder holds already, the file or a wider one; a narrower one holds too little", () => {
  const [narrow, middle, wide] = ladderOf("held", 3);
  const holdersOfMiddle = [middle, wide];
  assert.equal(heldFrom(holdersOfMiddle, documentOf([middle.href, false])), true, "the file itself, loading or not");
  assert.equal(heldFrom(holdersOfMiddle, documentOf([wide.href, true])), true, "a wider file of it");
  assert.equal(heldFrom(holdersOfMiddle, documentOf([narrow.href, true])), false, "a narrower one does not hold it");
  assert.equal(heldFrom(holdersOfMiddle, documentOf()), false);
});

test("a page links the widest file holding its own that has loaded, else one a warm is bringing, else its own", () => {
  const [own, wide] = ladderOf("linked", 2);
  const holders = [own, wide];
  /** No file a warm is bringing: nothing the draw could wait for but what React links itself. */
  const none = () => false;
  assert.equal(
    linkFor(own, holders, documentOf([own.href, true], [wide.href, true]), none),
    wide,
    "both loaded: the wider",
  );
  assert.equal(
    linkFor(own, holders, documentOf([own.href, true], [wide.href, false]), none),
    own,
    "its own loaded and a wider on its way: its own, with no wait",
  );
  assert.equal(linkFor(own, holders, documentOf([wide.href, true]), none), wide, "a wider loaded alone");
  assert.equal(
    linkFor(own, holders, documentOf(), none),
    own,
    "nothing held: its own, which React links and waits for",
  );
  // A wider file still on its way that no warm brought (a draw's own, whose draw waits for it): the page cannot wait for
  // it, so it links its own, which React waits for.
  assert.equal(linkFor(own, holders, documentOf([wide.href, false]), none), own);
  // One a warm is bringing: the page links it and waits for it (sheet-arrival.ts), never linking a narrower copy.
  const warmed = (href) => href === wide.href;
  assert.equal(linkFor(own, holders, documentOf([wide.href, false]), warmed), wide);
  assert.equal(linkFor(own, holders, documentOf(), warmed), own, "only one in the document");
});

test("a narrower file is taken out once a wider has loaded and it has too; one on its way stays until it loads", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ladder = ladderOf("taken", 3);
  const [narrow, middle, wide] = ladder;
  const doc = documentOf([narrow.href, true], [middle.href, false], [wide.href, true], ["/sheets/other.css", true]);
  const stop = keepOneOfEach([ladder], doc);
  assert.deepEqual(doc.hrefs(), [middle.href, wide.href, "/sheets/other.css"], "the middle is still on its way");
  doc.loads(doc.links[0]);
  t.mock.timers.tick(0);
  assert.deepEqual(doc.hrefs(), [wide.href, "/sheets/other.css"], "one file of the ladder, and the rest untouched");
  stop();
  // A wider file still on its way takes nothing out: the narrower holds the page's rules meanwhile.
  const waiting = documentOf([narrow.href, true], [wide.href, false]);
  keepOneOfEach([ladder], waiting)();
  assert.deepEqual(waiting.hrefs(), [narrow.href, wide.href]);
});

test("kept at it: a link's load takes the narrower out a task later, once every listener has heard it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ladder = ladderOf("kept", 2);
  const [narrow, wide] = ladder;
  const doc = documentOf([narrow.href, true]);
  const stop = keepOneOfEach([ladder], doc);
  assert.ok(doc.hears(), "it listens for loads on their way down");
  const wider = doc.put(wide.href, false);
  doc.loads(wider);
  assert.deepEqual(doc.hrefs(), [narrow.href, wide.href], "not while the load is still being heard");
  t.mock.timers.tick(0);
  assert.deepEqual(doc.hrefs(), [wide.href]);
  // Something else's load (an image) asks for nothing.
  const again = doc.put(narrow.href, true);
  doc.loads({ localName: "img", sheet: null });
  t.mock.timers.tick(0);
  assert.deepEqual(doc.hrefs(), [wide.href, narrow.href]);
  doc.loads(again);
  t.mock.timers.tick(0);
  assert.deepEqual(doc.hrefs(), [wide.href]);
  stop();
  assert.equal(doc.hears(), false, "stopped, it hears nothing");
});

test("what a tab held before it was kept at it is taken out at once, and a list with no ladders asks for nothing", () => {
  const ladder = ladderOf("before", 2);
  const doc = documentOf([ladder[0].href, true], [ladder[1].href, true]);
  const stop = keepOneOfEach([ladder], doc);
  assert.deepEqual(doc.hrefs(), [ladder[1].href]);
  stop();
  const none = documentOf();
  keepOneOfEach([], none)();
  assert.equal(none.hears(), false);
});
