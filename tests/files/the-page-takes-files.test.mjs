/**
 * Files brought to a page rather than picked (apps/dashboard/src/surfaces/kit/drop/drop.ts): over a window in memory, whose events carry
 * what a browser's do. A drag of files is said and let land, a drag of anything else is left alone, whatever stands over the page and takes
 * them for itself keeps them, and words pasted into a box stay that box's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { holdsFiles, imagesIn, listenForFiles } from "../../apps/dashboard/src/surfaces/kit/drop/drop.ts";

const photo = (name) => new File([new Uint8Array(4)], name, { type: "image/jpeg" });

function aWindow() {
  const heard = {};
  return {
    heard,
    addEventListener: (kind, fn) => {
      heard[kind] = fn;
    },
    removeEventListener: (kind, fn) => {
      if (heard[kind] === fn) delete heard[kind];
    },
  };
}

/** An event as it reaches the window: `taken` where something on the way up prevented its default. */
function anEvent({ types = ["Files"], files = [], taken = false, target = { tagName: "DIV" } } = {}) {
  const transfer = { types, files };
  return {
    dataTransfer: transfer,
    clipboardData: transfer,
    defaultPrevented: taken,
    target,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

function aPage() {
  const win = aWindow();
  const took = [];
  const over = [];
  const stop = listenForFiles(
    win,
    (files) => took.push(files.map((f) => f.name)),
    (now) => over.push(now),
  );
  return { win, took, over, stop };
}

test("a drag of files says so as it comes over the page, and stops saying so only when it has left all of it", () => {
  const { win, over } = aPage();
  win.heard.dragenter(anEvent());
  win.heard.dragenter(anEvent());
  assert.equal(over.at(-1), true);
  win.heard.dragleave(anEvent());
  assert.equal(over.at(-1), true, "from one element to the one inside it is still on the page");
  win.heard.dragleave(anEvent());
  assert.equal(over.at(-1), false);
});

test("a drop lands, and the browser is told not to open the photo in the tab", () => {
  const { win, took, over } = aPage();
  win.heard.dragenter(anEvent());
  const moving = anEvent();
  win.heard.dragover(moving);
  assert.equal(moving.defaultPrevented, true, "without this a browser doesn't let anything land");
  const landing = anEvent({ files: [photo("a.jpg"), photo("b.jpg")] });
  win.heard.drop(landing);
  assert.equal(landing.defaultPrevented, true);
  assert.deepEqual(took, [["a.jpg", "b.jpg"]]);
  assert.equal(over.at(-1), false);
  // The depth starts afresh: the drop never left, so nothing else would have counted it down.
  win.heard.dragenter(anEvent());
  win.heard.dragleave(anEvent());
  assert.equal(over.at(-1), false);
});

test("a drag of words or a link is left alone: selecting text and dragging it still works", () => {
  const { win, took, over } = aPage();
  const words = { types: ["text/plain"] };
  win.heard.dragenter(anEvent(words));
  const moving = anEvent(words);
  win.heard.dragover(moving);
  assert.equal(moving.defaultPrevented, false);
  const landing = anEvent(words);
  win.heard.drop(landing);
  assert.equal(landing.defaultPrevented, false);
  assert.deepEqual(took, []);
  assert.ok(!over.includes(true));
});

test("what stands over the page and takes them for itself keeps them: Ask's panel, with Files behind it", () => {
  const { win, took, over } = aPage();
  win.heard.dragenter(anEvent());
  win.heard.dragover(anEvent({ taken: true }));
  assert.equal(over.at(-1), false, "the page isn't what this will land on");
  win.heard.drop(anEvent({ files: [photo("a.jpg")], taken: true }));
  assert.deepEqual(took, []);
});

test("an image pasted lands, and a paste of words, or one into a box, is the box's", () => {
  const { win, took } = aPage();
  const pasting = anEvent({ files: [photo("shot.png"), new File(["x"], "notes.txt", { type: "text/plain" })] });
  win.heard.paste(pasting);
  assert.equal(pasting.defaultPrevented, true);
  assert.deepEqual(took, [["shot.png"]], "only the image");

  const words = anEvent({ files: [] });
  win.heard.paste(words);
  assert.equal(words.defaultPrevented, false, "nothing to take: the paste goes on");

  for (const target of [{ tagName: "INPUT" }, { tagName: "TEXTAREA" }, { tagName: "DIV", isContentEditable: true }]) {
    const inABox = anEvent({ files: [photo("b.png")], target });
    win.heard.paste(inABox);
    assert.equal(inABox.defaultPrevented, false);
  }
  win.heard.paste(anEvent({ files: [photo("c.png")], taken: true }));
  assert.equal(took.length, 1, "nor one that Ask's field already took");
});

test("leaving the page stops all of it", () => {
  const { win, stop } = aPage();
  assert.deepEqual(Object.keys(win.heard).sort(), ["dragenter", "dragleave", "dragover", "drop", "paste"]);
  stop();
  assert.deepEqual(Object.keys(win.heard), []);
});

test("what a transfer holds, where there is none", () => {
  assert.equal(holdsFiles(null), false);
  assert.deepEqual(imagesIn(null), []);
  assert.equal(holdsFiles({ types: ["text/plain", "Files"] }), true);
});
