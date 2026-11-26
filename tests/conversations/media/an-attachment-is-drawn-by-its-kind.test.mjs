/**
 * The kit's one attachment (surfaces/kit/media/tl-media.tsx), drawn on the stub React: a photo opens the message's own
 * media route, a voice note plays there, a file downloads from it, an attachment the edge could not keep says so, and
 * without the bridge's links nothing is drawn at all. Pinned as the component's text in conversations/media/media.test.mjs
 * until 26 Nov 2026.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, find, textOf } from "../../_stub-react.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";
import { importSrc } from "../../_source.mjs";

installStubReact({});
const { TlMedia } = await importSrc("apps/dashboard/src/surfaces/kit/media/tl-media.tsx");

const M = "11111111-1111-4111-8111-111111111111";
const ROUTE = `/api/v1/messages/${M}/media?workspace=marisas`;
const asked = [];
const linked = () =>
  bridgeHolds({
    parts: {
      href: (key, params) => (asked.push([key, params]), key === "GET messages/[id]/media" ? ROUTE : null),
    },
  });
const vm = (over) => ({ messageId: M, kind: "image", available: true, caption: null, filename: null, ...over });

test("a photo opens the message's own media route, with its caption or what it is", () => {
  linked();
  const photo = TlMedia({ media: vm({ caption: "the cut I want" }) });
  assert.equal(photo.props.href, ROUTE);
  assert.equal(find(photo, (n) => n.type === "img").props.src, ROUTE);
  assert.equal(find(photo, (n) => n.type === "img").props.alt, "the cut I want");
  assert.equal(
    find(TlMedia({ media: vm() }), (n) => n.type === "img").props.alt,
    "Photo the customer sent",
    "no caption: what it is",
  );
  assert.deepEqual(asked.at(-1), ["GET messages/[id]/media", { id: M }], "the route for this message");
});

test("a voice note plays where it is kept, a video too, and a file downloads", () => {
  linked();
  const audio = TlMedia({ media: vm({ kind: "audio" }) });
  assert.deepEqual(
    [audio.type, audio.props.controls, audio.props.preload, audio.props.src],
    ["audio", true, "none", ROUTE],
  );
  assert.equal(TlMedia({ media: vm({ kind: "video" }) }).type, "video");
  const file = TlMedia({ media: vm({ kind: "document", filename: "quote.pdf" }) });
  assert.deepEqual([file.props.href, file.props.download], [ROUTE, true]);
  assert.match(textOf(file), /quote\.pdf/);
});

test("an attachment the edge could not keep says so instead of a broken image; without the bridge's links, nothing is drawn", () => {
  linked();
  assert.equal(textOf(TlMedia({ media: vm({ available: false }) })), "Attachment couldn't be saved.");
  assert.equal(TlMedia({ media: null }), null);
  bridgeHolds({}, { fresh: true });
  assert.equal(TlMedia({ media: vm() }), null, "a seeded thread, or a page with no route, draws nothing");
});
