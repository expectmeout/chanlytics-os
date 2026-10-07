/**
 * What a slot box holds, read off its DOM (surfaces/campaigns/templates/slots/slot-dom.ts; the review's item 16): the
 * stored words from text nodes, chips and line breaks, whatever shape a browser leaves them in, and a place in those
 * words for every place the caret can stand, both ways. The reading is pure over what a node says of itself, so it is
 * run here over plain objects. What touches a page's selection and range is a browser's: the pull request says how it
 * was run in one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  offsetIn,
  pointIn,
  scanBox,
  selectionIn,
  typedSlots,
} from "../../../../apps/dashboard/src/surfaces/campaigns/templates/slots/slot-dom.ts";

/* ---------------------------------- nodes ---------------------------------- */

const el = (nodeName, ...kids) => ({
  nodeType: 1,
  nodeName,
  nodeValue: null,
  childNodes: kids,
  getAttribute: () => null,
});
const text = (s) => ({ nodeType: 3, nodeName: "#text", nodeValue: s, childNodes: [] });
const chip = (n, label = "Name") => ({
  nodeType: 1,
  nodeName: "SPAN",
  nodeValue: null,
  childNodes: [text(label)],
  getAttribute: (k) => (k === "data-slot" ? String(n) : null),
});
// A chip for a slot the words wrote in a way but its key between plain braces: it says how, in data-written.
const chipWritten = (n, written, label = "Name") => ({
  nodeType: 1,
  nodeName: "SPAN",
  nodeValue: null,
  childNodes: [text(label)],
  getAttribute: (k) => (k === "data-slot" ? String(n) : k === "data-written" ? written : null),
});
const br = () => el("BR");
const box = (...kids) => el("DIV", ...kids);
const read = (root) => scanBox(root).text;

/* ---------------------------------- the words ---------------------------------- */

test("a box is read as the stored words: text as it is, a chip as its slot, the box's own last break as nothing", () => {
  assert.equal(read(box(text("Hi "), chip(1), text(", welcome"), br())), "Hi {{1}}, welcome");
  assert.equal(read(box(chip(1), chip(2), br())), "{{1}}{{2}}", "adjacent chips");
  assert.equal(read(box(chip(10), br())), "{{10}}", "{{10}} is one chip");
  assert.equal(read(box(br())), "", "an empty box");
  assert.equal(read(box()), "", "a box with nothing, not even its break");
  assert.equal(read(box(text("a"), text("b"))), "ab", "text nodes the browser split are one run of words");
  assert.equal(read(box(chip(3, "Link"))), "{{3}}", "what the chip says is the label's, and the words are the slot's");
});

test("a chip is the slot it carries, not what it says: its name never reaches the words", () => {
  assert.equal(read(box(chip(2, "{{9}} Date"), br())), "{{2}}");
  assert.equal(read(box(el("SPAN", text("{{1}}")), br())), "{{1}}", "a span with no slot is words, as any is");
});

test("a line break is a newline, except the box's last, and Enter as a browser makes it reads as the newline it means", () => {
  assert.equal(read(box(text("a"), br(), text("b"), br())), "a\nb");
  assert.equal(read(box(text("a\nb"), br())), "a\nb", "a newline in the words is one");
  assert.equal(read(box(text("a"), br(), br())), "a\n", "a break that ends a line, then the box's own");
  assert.equal(read(box(text("a"), el("DIV", text("b")))), "a\nb", "a line the browser made a block of");
  assert.equal(read(box(text("a"), el("DIV", br()), el("DIV", text("b")))), "a\n\nb", "an empty line is one newline");
  assert.equal(read(box(el("DIV", text("a")), el("DIV", text("b")))), "a\nb", "the first block starts no line");
  assert.equal(read(box(text("a"), el("DIV", text("b"), br()))), "a\nb", "a block's own last break is no newline");
  assert.equal(read(box(text("a"), el("P", text("b")), el("LI", text("c")))), "a\nb\nc");
});

test("what a browser wraps typed words in is read through: the words, with no break of its own", () => {
  assert.equal(read(box(text("a "), el("SPAN", text("b "), el("B", text("c"))), br())), "a b c");
  assert.equal(read(box(text("Hi "), el("SPAN", chip(1), text("!")), br())), "Hi {{1}}!");
});

/* ---------------------------------- a place in the words ---------------------------------- */

test("a place in the DOM is a place in the words: in a text node, between children, and inside a chip as before it", () => {
  const hi = text("Hi ");
  const tail = text(", welcome");
  const c = chip(1);
  const root = box(hi, c, tail, br());
  const scan = scanBox(root);
  assert.equal(offsetIn(scan, { node: hi, offset: 0 }), 0);
  assert.equal(offsetIn(scan, { node: hi, offset: 3 }), 3);
  assert.equal(offsetIn(scan, { node: tail, offset: 0 }), 8, "after the chip, which is five long as it is written");
  assert.equal(offsetIn(scan, { node: tail, offset: 9 }), 17);
  assert.equal(offsetIn(scan, { node: root, offset: 0 }), 0, "before the first child");
  assert.equal(offsetIn(scan, { node: root, offset: 1 }), 3, "before the chip");
  assert.equal(offsetIn(scan, { node: root, offset: 2 }), 8, "after it");
  assert.equal(offsetIn(scan, { node: root, offset: 3 }), 17, "after the last words, before the box's own break");
  assert.equal(offsetIn(scan, { node: root, offset: 4 }), 17, "and after it");
  assert.equal(offsetIn(scan, { node: c, offset: 0 }), 3, "inside the chip is before it");
  assert.equal(offsetIn(scan, { node: c.childNodes[0], offset: 2 }), 3, "and so is inside what it says");
  assert.equal(offsetIn(scan, { node: hi, offset: 99 }), 3, "past a text node is its end");
  assert.equal(
    offsetIn(scan, { node: text("elsewhere"), offset: 1 }),
    null,
    "a place outside the box is no place in it",
  );
});

test("a place in the words is the first place the caret can stand: after the words before a slot, after a slot before the words, before the box's own break", () => {
  const hi = text("Hi ");
  const c = chip(1);
  const tail = text("!");
  const root = box(hi, c, tail, br());
  const scan = scanBox(root);
  assert.deepEqual(pointIn(scan, 0), { node: root, offset: 0 }, "the start");
  assert.deepEqual(pointIn(scan, 2), { node: hi, offset: 2 });
  assert.deepEqual(pointIn(scan, 3), { node: hi, offset: 3 }, "before the chip, at the end of the words before it");
  assert.deepEqual(pointIn(scan, 8), { node: root, offset: 2 }, "after the chip, between it and the words after it");
  assert.deepEqual(pointIn(scan, 9), { node: tail, offset: 1 }, "the end of the words");
  assert.deepEqual(pointIn(scan, 999), { node: root, offset: 4 }, "past the words is the end");
  const last = box(text("a "), chip(2), br());
  assert.deepEqual(
    pointIn(scanBox(last), 7),
    { node: last, offset: 2 },
    "after a last chip, and before the box's break",
  );
  const empty = box();
  assert.deepEqual(pointIn(scanBox(empty), 0), { node: empty, offset: 0 }, "an empty box has the one place");
});

test("a place there and back is the same place, in every shape the box can have", () => {
  const shapes = [
    box(text("Hi "), chip(1), text(", welcome"), br()),
    box(chip(1), chip(2), br()),
    box(chip(1), text(" "), chip(10), br()),
    box(text("a"), br(), text("b"), br()),
    box(text("a"), el("DIV", text("b")), el("DIV", br()), el("DIV", text("c"))),
    box(text("one"), text("two"), chip(3), text("three"), br()),
    box(br()),
    box(text("x")),
    box(text("emoji 🙂 "), chip(2), br()),
  ];
  for (const root of shapes) {
    const scan = scanBox(root);
    const inChip = (at) => scan.chips.some((c) => at > c.start && at < c.start + `{{${c.slot}}}`.length);
    for (let at = 0; at <= scan.text.length; at += 1) {
      const point = pointIn(scan, at);
      assert.ok(point, `a place for ${at} in ${JSON.stringify(scan.text)}`);
      // The caret never stands inside a slot's written form: a place there is the place after the slot.
      if (!inChip(at)) assert.equal(offsetIn(scan, point), at, `${at} in ${JSON.stringify(scan.text)}`);
    }
  }
  const after = box(text("Hi "), chip(1), text("!"));
  const scan = scanBox(after);
  for (const inside of [4, 5, 6, 7]) assert.equal(offsetIn(scan, pointIn(scan, inside)), 8, `${inside} is in the slot`);
});

test("a selection is a place in the words at each end, start before end whichever way it was dragged, and none outside the box", () => {
  const hi = text("Hi ");
  const c = chip(1);
  const tail = text(", welcome");
  const root = box(hi, c, tail, br());
  const scan = scanBox(root);
  const forwards = { anchorNode: hi, anchorOffset: 1, focusNode: tail, focusOffset: 2 };
  assert.deepEqual(selectionIn(scan, forwards), { start: 1, end: 10 });
  const backwards = { anchorNode: tail, anchorOffset: 2, focusNode: hi, focusOffset: 1 };
  assert.deepEqual(selectionIn(scan, backwards), { start: 1, end: 10 });
  assert.deepEqual(
    selectionIn(scan, { anchorNode: root, anchorOffset: 2, focusNode: root, focusOffset: 2 }),
    {
      start: 8,
      end: 8,
    },
    "a caret after the chip, where a browser puts it between children",
  );
  assert.equal(selectionIn(scan, { anchorNode: text("x"), anchorOffset: 0, focusNode: hi, focusOffset: 0 }), null);
  assert.equal(selectionIn(scan, { anchorNode: null, anchorOffset: 0, focusNode: null, focusOffset: 0 }), null);
});

/* ---------------------------------- slots typed as braces ---------------------------------- */

test("a slot typed as braces is told from a chip: the box is to be drawn again for it, and for nothing else", () => {
  const numbered = { kind: "numbered" };
  assert.equal(typedSlots(scanBox(box(text("Hi "), chip(1), br())), numbered), 0, "a chip is drawn");
  assert.equal(typedSlots(scanBox(box(text("Hi {{1}}"), br())), numbered), 1, "braces typed are not");
  assert.equal(typedSlots(scanBox(box(text("{{1}}"), chip(2), br())), numbered), 1);
  assert.equal(
    typedSlots(scanBox(box(text("{{1"), text("}}"), br())), numbered),
    1,
    "typed in two runs by the browser, one slot",
  );
  assert.equal(
    typedSlots(scanBox(box(text("{{x}} { {1} } {{1}} {{ 1 }}"), br())), numbered),
    1,
    "braces round no number are words, and {{1}} among them is the one slot",
  );
  assert.equal(
    typedSlots(scanBox(box(text("Hi {{01}}"), br())), numbered),
    1,
    "a spelling the send fills is a slot too, so it is drawn as the chip it is",
  );
  assert.equal(
    typedSlots(scanBox(box(text("Hi "), chipWritten(1, "{{01}}"), br())), numbered),
    0,
    "and then it is drawn",
  );
  assert.equal(typedSlots(scanBox(box(text("{{1}}{{2}}"), br())), numbered), 2);
  assert.equal(typedSlots(scanBox(box(br())), numbered), 0);
});

/* ---------------------------------- named slots (a reach-out's email, step 5) ---------------------------------- */

test("a chip carries its key, a name as well as a number: the words are read with {{your name}} for it, spaces and all", () => {
  assert.equal(
    read(box(text("Hi "), chip("business"), text(", from "), chip("your business"), br())),
    "Hi {{business}}, from {{your business}}",
  );
  assert.equal(
    read(box(chip("booking link", "Booking link"), br())),
    "{{booking link}}",
    "the label is the chip's, the words the slot's",
  );
  const root = box(text("Sign: "), chip("your name"), br());
  const scan = scanBox(root);
  assert.deepEqual(
    scan.chips.map((c) => [c.slot, c.start]),
    [["your name", 6]],
  );
  // The caret never stands inside the slot's written form, however long its name: a place in it is the place after it.
  assert.equal(offsetIn(scan, pointIn(scan, 9)), "Sign: {{your name}}".length);
});

test("a named slot typed as braces is told from a chip as a numbered one is, by the set the box is read over", () => {
  const named = { kind: "named" };
  assert.equal(typedSlots(scanBox(box(text("Hi "), chip("city"), br())), named), 0, "a chip is drawn");
  assert.equal(
    typedSlots(scanBox(box(text("Hi {{city}} and {{first name}}"), br())), named),
    2,
    "an unknown name is a slot too",
  );
  assert.equal(
    typedSlots(scanBox(box(text("{{}} {{ }} { {city} }"), br())), named),
    0,
    "braces that name nothing are words",
  );
  assert.equal(
    typedSlots(scanBox(box(text("{{ City }} {{CITY}}"), br())), named),
    2,
    "a name in capitals or with spaces is the slot the send fills, so it is drawn as one",
  );
  // Read over the numbered set the same braces are words: which slots there are is the message's.
  assert.equal(typedSlots(scanBox(box(text("Hi {{city}}"), br())), { kind: "numbered" }), 0);
});

/* ---------------------------------- a chip keeps how its slot was written ---------------------------------- */

test("a chip for a slot written another way reads back as it was written, so the words never change under an edit", () => {
  assert.equal(read(box(text("Hi "), chipWritten(1, "{{01}}"), text("!"), br())), "Hi {{01}}!");
  assert.equal(read(box(chipWritten("your name", "{{ Your Name }}", "Your name"), br())), "{{ Your Name }}");
  assert.equal(read(box(chip(1), chipWritten(1, "{{001}}"), br())), "{{1}}{{001}}", "beside one written plainly");
  assert.equal(read(box(chipWritten(2, ""), br())), "{{2}}", "an empty spelling is none");
});

test("a place in the words runs over the spelling a chip carries, so a caret and a selection stay where they stand", () => {
  const hi = text("Hi ");
  const c = chipWritten(1, "{{001}}");
  const tail = text("!");
  const root = box(hi, c, tail, br());
  const scan = scanBox(root);
  assert.deepEqual(
    scan.chips.map((x) => [x.slot, x.start, x.written]),
    [["1", 3, "{{001}}"]],
  );
  assert.equal(scan.text, "Hi {{001}}!");
  assert.equal(offsetIn(scan, { node: tail, offset: 0 }), 10, "after the chip: past its written form, not its key's");
  assert.equal(offsetIn(scan, { node: tail, offset: 1 }), 11);
  // The caret never stands inside the written form, however it is spelled: a place in it is after the slot.
  for (const at of [4, 6, 9]) assert.equal(offsetIn(scan, pointIn(scan, at)), 10, `${at} is inside {{001}}`);
  assert.equal(offsetIn(scan, pointIn(scan, 3)), 3, "before it is before it");
});
