/**
 * Attachments, seen: served in the thread, and looked at by the receptionist
 * when the workspace says so.
 *
 * A photo or a voice note used to be "[image attachment]" in the thread with
 * nothing to open, and the receptionist answered every one with "I can't
 * read that" and a handoff. The bytes were already in the bucket; now a route
 * serves them and the thread draws them. And with features.vision on, a
 * photo goes to the model beside the words, under every rule the prompt
 * already carries.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  FeaturesConfigSchema,
  TenantConfigSchema,
  TenantConfigWriteSchema,
  mediaKind,
  mediaVM,
  messageText,
} from "@chanlytics/contracts";
import { readRaw } from "../../_source.mjs";
import { givenOn } from "../../_css.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dto = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/conversations/dto.ts")).href
);
const vision = await import(pathToFileURL(path.join(here, "../../../packages/core/src/inbound/vision.ts")).href);

const msg = (over) => ({
  id: "m1",
  direction: "inbound",
  sender: "customer",
  type: "media",
  body: null,
  media: null,
  meta: { raw_type: "image" },
  status: "received",
  created_at: "2026-09-05T14:00:00Z",
  channel_ts: null,
  ...over,
});

test("the config section is opt-in, refuses an unknown ability on the save, and rides inside the tenant config", () => {
  assert.deepEqual(FeaturesConfigSchema.parse({}), {});
  assert.deepEqual(FeaturesConfigSchema.parse({ vision: true }), { vision: true });
  assert.ok(!FeaturesConfigSchema.safeParse({ vision: "yes" }).success);
  // An ability a newer dashboard wrote is left out by an older read, never kept, and never saved.
  assert.deepEqual(FeaturesConfigSchema.parse({ telepathy: true }), {}, "an unknown ability is left out, not kept");
  assert.ok(
    !TenantConfigWriteSchema.safeParse({ features: { telepathy: true } }).success,
    "an unknown ability is refused on the save",
  );
  const cfg = TenantConfigSchema.parse({ features: { vision: true } });
  assert.equal(cfg.features?.vision, true);
  assert.equal(TenantConfigSchema.parse({}).features, undefined, "absent means off");
});

test("what an attachment is, from its mime or from WhatsApp's word for it", () => {
  assert.equal(mediaKind("image/jpeg"), "image");
  assert.equal(mediaKind("IMAGE/WEBP"), "image");
  assert.equal(mediaKind("audio/ogg; codecs=opus"), "audio");
  assert.equal(mediaKind("video/mp4"), "video");
  assert.equal(mediaKind("application/pdf"), "document");
  assert.equal(mediaKind(null, "sticker"), "image");
  assert.equal(mediaKind(null, "audio"), "audio");
  assert.equal(mediaKind(null, null), "other");
});

test("the thread's line above an attachment names it, and the attachment itself is drawn from the message", () => {
  const photo = msg({
    media: { mime_type: "image/jpeg", fetch_state: "stored", caption: "can you do this?", filename: null },
  });
  assert.equal(messageText(photo), "Photo: can you do this?");
  assert.deepEqual(mediaVM(photo), {
    messageId: "m1",
    kind: "image",
    mime: "image/jpeg",
    filename: null,
    caption: "can you do this?",
    available: true,
  });
  const note = msg({
    meta: { raw_type: "audio" },
    media: { mime_type: "audio/ogg", fetch_state: "failed", caption: null, filename: null },
  });
  assert.equal(messageText(note), "Voice note");
  assert.equal(mediaVM(note).available, false, "a failed fetch has nothing to serve");
  assert.equal(mediaVM(msg({ type: "text", body: "hi", media: null })), null, "words carry no attachment");
  assert.equal(
    messageText(msg({ media: { mime_type: null, fetch_state: "pending" }, meta: { raw_type: "document" } })),
    "Document",
  );
  // The view models carry it through, the Inbox's timeline entry and Conversations' message: run in
  // media/a-photo-is-seen-and-drawn-where-it-is-kept.test.mjs (pinned as the two view models' text until 26 Nov 2026).
});

test("a browser sees the attachment's facts and never its storage path", () => {
  const raw = {
    provider_media_id: "wamid.X",
    mime_type: "image/jpeg",
    caption: "hi",
    filename: null,
    sha256: "abc",
    storage_path: "t/c/m.jpg",
    fetch_state: "stored",
  };
  assert.deepEqual(dto.mediaPublic(raw), {
    mime_type: "image/jpeg",
    fetch_state: "stored",
    filename: null,
    caption: "hi",
  });
  assert.equal(dto.mediaPublic(null), null);
  assert.deepEqual(
    dto.mediaPublic({ mime_type: "audio/ogg" }),
    { mime_type: "audio/ogg", filename: null, caption: null },
    "no fetch_state key when there is none",
  );
  // The one-thread route is run, not read: ask/readers/, "the one thread's messages carry an attachment's
  // public facts". The thread's export writes the same filtered shape: the type it writes (MessageDto's media) is
  // mediaPublic's, which tsc holds, and nothing in the file it makes shows the record (dto.ts's and the export's text were
  // read until 26 Nov 2026).
});

// The media route: a member of the named workspace, an attachment the edge stored, a path under the workspace's own id,
// signed for five minutes, by a redirect the wrapper can stamp: run in media/an-attachment-opens-as-a-signed-link.test.mjs,
// where the route's, message-media.ts's and reads.ts's text was read until 26 Nov 2026.

test("the thread draws the attachment from one component, wherever it opens", () => {
  // The component is the kit's (surfaces/kit/media), which the pages import. What it draws, for each kind, and nothing
  // without the bridge: media/an-attachment-is-drawn-by-its-kind.test.mjs (pinned as its text until 26 Nov 2026).
  // The thread drawing it, and its style, wait for the Inbox's world (lane 7) and the stylesheets.
  assert.ok(
    readRaw("apps/dashboard/src/surfaces/inbox/thread/timeline.tsx").includes(
      "{entry.media && <TlMedia media={entry.media} />}",
    ),
  );
  // The picture's own rule, asked of the parsed sheet under any query (read as its text until 26 Nov 2026): never wider
  // than the thread, and bounded in height.
  const picture = givenOn("apps/dashboard/src/styles/components.css", ".tl-media img", null);
  assert.deepEqual([picture["max-width"], picture["max-height"]], ["100%", "280px"]);
});

test("vision: only small real images, and the words beside the picture restate the rules", () => {
  assert.equal(vision.isVisionMime("image/jpeg"), true);
  assert.equal(vision.isVisionMime("image/webp; charset=binary"), true);
  assert.equal(vision.isVisionMime("image/heic"), false, "not an accepted block type");
  assert.equal(vision.isVisionMime("audio/ogg"), false);
  assert.equal(vision.isVisionMime(null), false);
  assert.equal(vision.VISION_MAX_BYTES, 4 * 1024 * 1024);
  const withCaption = vision.photoUserText("  can you do this colour?  ");
  assert.ok(withCaption.startsWith('The customer sent this photo with the message: "can you do this colour?"'));
  assert.ok(vision.photoUserText(null).startsWith("The customer sent this photo, with no words."));
  for (const rule of ["no price", "no health or skin advice", "never a confirmed appointment"])
    assert.ok(withCaption.includes(rule), rule);
  assert.equal(vision.toBase64(new Uint8Array([104, 105]).buffer), "aGk=");
});

// The handler looks only when the workspace, the mode and the moment allow, and never fetches twice. Run, not read
// (pinned as unreadable.ts's, model-turn.ts's, persist.ts's, receptionist-brain.ts's and tenant-runtime.ts's text until
// 26 Nov 2026): with the photo row on, the model is shown the picture itself, first, then the words restating the
// rules; off, or past what the model takes, the photo is handed over as one nobody could look at; the switch is the
// config's, and a load that fails turns nothing on (media/a-photo-is-seen-and-drawn-where-it-is-kept.test.mjs). A
// workspace that will not answer never pays to download it, one download per message, and a fetch that failed is handed
// over, never answered from its caption (inbound/phases/).

// The owner turns it on with the switch on What it can do's photo row (the Settings wiring review, 18 Oct 2026), which
// patches features.vision and nothing else, and is off unless the config says true: receptionist/business-tab/answers/
// presses it and draws it.
