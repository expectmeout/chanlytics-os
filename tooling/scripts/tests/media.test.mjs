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
import { FeaturesConfigSchema, TenantConfigSchema, mediaKind, mediaVM, messageText } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dto = await import(pathToFileURL(path.join(here, "../../../apps/dashboard/src/server/dto.ts")).href);
const vision = await import(pathToFileURL(path.join(here, "../../../apps/edge/lib/vision.ts")).href);

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

test("the config section is opt-in, strict, and rides inside the tenant config", () => {
  assert.deepEqual(FeaturesConfigSchema.parse({}), {});
  assert.deepEqual(FeaturesConfigSchema.parse({ vision: true }), { vision: true });
  assert.ok(!FeaturesConfigSchema.safeParse({ vision: "yes" }).success);
  assert.ok(
    !FeaturesConfigSchema.safeParse({ telepathy: true }).success,
    "unknown abilities are refused, not silently kept",
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
  // The view models carry it through.
  const vm = readCode("packages/contracts/src/viewmodels.ts");
  assert.ok(vm.includes("...(media ? { media } : {}),"), "the Inbox timeline entry");
  assert.ok(vm.includes("...(mediaVM(m) ? { media: mediaVM(m) as MediaVM } : {}),"), "the Conversations message");
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
  for (const rel of [
    "apps/dashboard/src/server/dto.ts",
    "apps/dashboard/app/api/v1/conversations/[id]/route.ts",
    "apps/dashboard/app/api/v1/conversations/[id]/export/route.ts",
  ]) {
    const src = readCode(rel);
    assert.ok(src.includes("media: mediaPublic(m.media),"), `${rel} maps through the filter`);
    assert.ok(!src.includes('media: m.media as MessageDto["media"]'), `${rel} no longer ships the raw JSON`);
  }
});

test("the media route: member of the named workspace, stored only, a redirect the wrapper can stamp", () => {
  const route = readCode("apps/dashboard/app/api/v1/messages/[id]/media/route.ts");
  assert.ok(route.includes("scope: workspace,"), "the workspace the tab named, declared on the export");
  assert.ok(route.includes('.eq("tenant_id", member.tenantId)'));
  assert.ok(route.includes('media.fetch_state !== "stored"'));
  assert.ok(route.includes("signedMediaUrl(media.storage_path, 300)"));
  assert.ok(
    route.includes("new Response(null, { status: 302, headers: { location: url } })"),
    "not Response.redirect(): its headers are immutable",
  );
});

test("the thread draws the attachment from one component, wherever it opens", () => {
  const bits = readRaw("apps/dashboard/src/legacy/components/data-bits.jsx");
  assert.ok(bits.includes("window.TlMedia = TlMedia;"));
  assert.ok(bits.includes("if (!media || !window.__href) return null;"), "nothing without the bridge");
  assert.ok(bits.includes('window.__href("GET messages/[id]/media", { id: media.messageId })'));
  assert.ok(
    bits.includes('<audio className="tl-media tl-media-audio" controls preload="none" src={src} />'),
    "a voice note can be played",
  );
  assert.ok(bits.includes("Attachment couldn't be saved."), "a failed fetch says so instead of a broken image");
  assert.ok(
    readRaw("apps/dashboard/src/legacy/pages/inbox-thread.jsx").includes(
      "{entry.media && <TlMedia media={entry.media} />}",
    ),
  );
  assert.ok(readRaw("apps/dashboard/src/legacy/styles/components.css").includes(".tl-media img {"));
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

test("the handler looks only when the workspace, the mode and the moment allow, and never fetches twice", () => {
  const wa = readCode("apps/edge/lib/whatsapp/inbound.ts");
  assert.ok(
    /const maySee =\s*n\.type === "media" &&\s*!!n\.media &&\s*!!rt\?\.features\?\.vision &&\s*isVisionMime\(n\.media\.mime_type\)/.test(
      wa,
    ),
  );
  assert.ok(
    /&&\s*!!brainCfg &&\s*\(replyMode === "auto" \|\| replyMode === "veto"\) &&\s*Date\.now\(\) > thread\.pausedUntil/.test(
      wa,
    ),
    "a held workspace or person gets the old path",
  );
  assert.ok(wa.includes("got.bytes.byteLength <= VISION_MAX_BYTES"));
  assert.ok(
    wa.includes('if (!maySee && (n.type !== "text" || !n.body)) {'),
    "the unreadable branch is skipped only when the photo is one we may look at",
  );
  // The DECISION is made where the routing needs it; the DOWNLOAD waits until
  // the cap, the budget, the billing pause and the mode have all agreed there
  // will be a reply, so none of them pays 25MB for bytes it throws away.
  assert.ok(
    wa.indexOf("const photo: { mime: string; base64: string } | null = null;") < 0,
    "the bytes are fetched, not declared and filled from two places",
  );
  assert.ok(
    wa.indexOf("if (maySee) {\n    const got = await sink.media(n);") > wa.indexOf("if (rt?.paused) {"),
    "the download sits below every gate that would discard it",
  );
  assert.ok(
    (wa.match(/sink\.media\(n\)/g) ?? []).length === 2,
    "one download per message: the unreadable path's, or the vision path's",
  );
  assert.ok(
    wa.includes("await sayUnreadable(thread.pausedUntil);\n      await sink.processed();"),
    "a photo that could not be fetched is handed over, not answered from its caption",
  );
  assert.ok(
    /const bodyText: string = maySee \? \(?n\.media\?\.caption\?\.trim\(\) \|\| "\[photo\]"\)? : \(?n\.body \?\? ""\)?;/.test(
      wa,
    ),
    "the record keeps the caption, not the instruction",
  );
  assert.ok(wa.includes("photo ? photoUserText(n.media?.caption) : bodyText,"));
  assert.ok(wa.includes("photo ?? undefined,\n      );"), "the image reaches the brain");
  assert.ok(readCode("apps/edge/lib/whatsapp/persist.ts").includes("return got;"), "sink.media hands the bytes back");
  const brain = readCode("apps/edge/lib/brain.ts");
  assert.ok(
    brain.includes('{ type: "image", source: { type: "base64", media_type: image.mime, data: image.base64 } },'),
  );
  assert.ok(brain.includes('{ type: "text", text: userText },'), "image first, then the words");
  const rt = readCode("apps/edge/lib/tenant-runtime.ts");
  assert.ok(rt.includes("features: parsed?.features ?? null,") && rt.includes("features: null,"));
});

test("the owner turns it on in Workspace, and a save carries the section", () => {
  // Since Task 3.7 it is a switch of the Business page's "Rules it always keeps" fold, which patches features.vision
  // and nothing else (business-tab-answers.test.mjs draws it, business-tab-folds.test.mjs saves it).
  const s = readRaw("apps/dashboard/src/legacy/pages/business-tab-folds.jsx");
  assert.ok(s.includes("vision: (config.features || {}).vision === true,"), "off unless explicitly on");
  assert.ok(
    s.includes("if (vision || features.vision !== undefined) next.features = { ...features, vision };"),
    "untouched workspaces keep no section",
  );
});
