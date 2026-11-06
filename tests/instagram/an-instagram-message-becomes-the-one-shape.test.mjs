/**
 * An Instagram DM becomes the one inbound shape (decision 0001, step 8): the webhook's events are read off Meta's
 * envelope (instagramEventsOf), each person's message is made into an InboundMessage by its own adapter
 * (inboundFromInstagram), and the delivery is proven by Meta's signature before any of it is read (metaSignatureValid).
 *
 * The payloads are Meta's own examples for the Instagram API with Instagram Login (webhooks, examples): `entry.id` is the
 * business's Instagram account, a person is an Instagram-scoped id (IGSID) and never a number, and a message's id is its
 * `mid`. What each kind becomes is what the receptionist's gates read (core inbound/gates.ts): words are answered, a photo
 * is media, a shared post is a person's to read, a story mention asks nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import * as channels from "@chanlytics/channels";

const { inboundFromInstagram, instagramEventsOf, metaSignatureValid } = channels;

const ACCOUNT = "17841400000000001";
const PERSON = "6000000000000001";
const AT = 1788793200123;

/** One `messaging[]` item from a person, as Meta sends it. */
const dm = (message, over = {}) => ({
  sender: { id: PERSON },
  recipient: { id: ACCOUNT },
  timestamp: AT,
  message: { mid: "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQx", ...message },
  ...over,
});

const envelope = (...messaging) => ({ object: "instagram", entry: [{ id: ACCOUNT, time: AT, messaging }] });

test("a typed DM becomes the one shape: its wire, the person by their Instagram id, and their words", () => {
  assert.deepEqual(inboundFromInstagram(dm({ text: "Do you have anything Saturday?" }), "Dana Ruiz"), {
    channel: "instagram",
    externalId: "aWdfZAG1faXRlbToxOklHTWVzc2FnZAUlEOjE3ODQx",
    identity: { externalId: PERSON, phoneE164: null, email: null },
    profileName: "Dana Ruiz",
    type: "text",
    kind: "text",
    rawType: "text",
    body: "Do you have anything Saturday?",
    channelTsIso: new Date(AT).toISOString(),
    media: null,
    consent: { optOut: false, optIn: false, optInMarketing: false },
    referral: null,
  });
});

test("a stop in words opts out, START is the way back, and a DM is never a yes to offers", () => {
  const read = (text) => inboundFromInstagram(dm({ text }), null).consent;
  assert.deepEqual(read("STOP"), { optOut: true, optIn: false, optInMarketing: false });
  assert.deepEqual(read("please stop messaging me"), { optOut: true, optIn: false, optInMarketing: false });
  assert.deepEqual(read("no me escriban más"), { optOut: true, optIn: false, optInMarketing: false });
  assert.deepEqual(read("START"), { optOut: false, optIn: true, optInMarketing: false });
  // Offers go by WhatsApp alone, and a DM is no yes for a wire it did not come on.
  assert.deepEqual(read("YES OFFERS"), { optOut: false, optIn: false, optInMarketing: false });
  assert.deepEqual(read("stop by at 4?"), { optOut: false, optIn: false, optInMarketing: false });
});

test("a photo is media the receptionist may look at, by its link; a voice note is media it will not read", () => {
  const photo = inboundFromInstagram(
    dm({
      attachments: [{ type: "image", payload: { url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1" } }],
    }),
    null,
  );
  assert.equal(photo.type, "media");
  assert.equal(photo.kind, "media");
  assert.equal(photo.rawType, "image");
  assert.equal(photo.body, null);
  assert.deepEqual(photo.media, {
    url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1",
    mime_type: "image/jpeg",
    caption: null,
    filename: null,
    fetch_state: "pending",
  });
  const voice = inboundFromInstagram(
    dm({
      attachments: [{ type: "audio", payload: { url: "https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=2" } }],
    }),
    null,
  );
  assert.equal(voice.kind, "media");
  assert.equal(voice.rawType, "audio");
  assert.equal(voice.media.mime_type, null);
  // An attachment with no link is nothing anyone can open: unsupported, not media.
  const bare = inboundFromInstagram(dm({ attachments: [{ type: "video", payload: {} }] }), null);
  assert.equal(bare.kind, "unsupported");
  assert.equal(bare.media, null);
});

test("a shared post or reel is a person's to read, with its link; a story mention asks nothing", () => {
  const post = inboundFromInstagram(
    dm({ attachments: [{ type: "share", payload: { url: "https://www.instagram.com/p/C0000000000/" } }] }),
    null,
  );
  assert.equal(post.kind, "share");
  assert.equal(post.type, "text");
  assert.equal(post.body, "Shared a post: https://www.instagram.com/p/C0000000000/");
  const reel = inboundFromInstagram(
    dm({
      attachments: [
        { type: "ig_reel", payload: { url: "https://www.instagram.com/reel/C1/", title: "Before and after" } },
      ],
    }),
    null,
  );
  assert.equal(reel.kind, "share");
  assert.equal(reel.body, "Shared a reel (Before and after): https://www.instagram.com/reel/C1/");
  const mention = inboundFromInstagram(
    dm({ attachments: [{ type: "story_mention", payload: { url: "https://lookaside.fbsbx.com/story/1" } }] }),
    null,
  );
  assert.equal(mention.kind, "system");
  assert.equal(mention.body, "Mentioned you in their story");
  assert.equal(mention.consent.optOut, false);
});

test("a reply to a story is the words they wrote; an icebreaker or a button they tapped is its title", () => {
  const reply = inboundFromInstagram(
    dm({
      text: "How much is this?",
      reply_to: { story: { id: "1800000000000001", url: "https://lookaside.fbsbx.com/s" } },
    }),
    null,
  );
  assert.equal(reply.kind, "text");
  assert.equal(reply.body, "How much is this?");
  const tapped = inboundFromInstagram(
    {
      sender: { id: PERSON },
      recipient: { id: ACCOUNT },
      timestamp: AT,
      postback: { mid: "aWdfZAG1-postback", title: "What are your hours?", payload: "HOURS" },
    },
    null,
  );
  assert.equal(tapped.externalId, "aWdfZAG1-postback");
  assert.equal(tapped.kind, "text");
  assert.equal(tapped.rawType, "postback");
  assert.equal(tapped.body, "What are your hours?");
  // A button whose title is STOP stops, as WhatsApp's do: the id is read too, so a localised button stops by it.
  const stopButton = inboundFromInstagram(
    { sender: { id: PERSON }, timestamp: AT, postback: { mid: "pb2", title: "Darme de baja ya", payload: "stop" } },
    null,
  );
  assert.equal(stopButton.consent.optOut, true);
});

test("the ad a person came from is kept, and an id that could not be stored is not", () => {
  const fromAd = inboundFromInstagram(
    dm({
      text: "Hi! Can I get more info?",
      referral: { source: "ADS", type: "OPEN_THREAD", ad_id: "120200000000000001" },
    }),
    null,
  );
  assert.deepEqual(fromAd.referral, { sourceId: "120200000000000001", sourceType: "ad" });
  const fromLink = inboundFromInstagram(
    dm({ text: "hi" }, { referral: { ref: "spring-promo", source: "SHORTLINK" } }),
    null,
  );
  assert.deepEqual(fromLink.referral, { sourceId: "spring-promo", sourceType: "link" });
  const bad = inboundFromInstagram(dm({ text: "hi", referral: { source: "ADS", ad_id: "12\u0000" } }), null);
  assert.equal(bad.referral, null);
});

test("a message with no id or no sender is nothing: there is no replay gate and nobody to answer", () => {
  assert.equal(inboundFromInstagram({ sender: { id: PERSON }, timestamp: AT, message: { text: "hi" } }, null), null);
  assert.equal(inboundFromInstagram({ timestamp: AT, message: { mid: "m1", text: "hi" } }, null), null);
});

test("the envelope's events: a person's message, the business's own reply (an echo), an unsend, and what asks nothing", () => {
  const events = instagramEventsOf(
    envelope(
      dm({ mid: "m.in", text: "hello" }),
      // The business wrote from the Instagram app (or through us): Meta echoes it, sender and recipient swapped.
      {
        sender: { id: ACCOUNT },
        recipient: { id: PERSON },
        timestamp: AT,
        message: { mid: "m.out", text: "Hi!", is_echo: true },
      },
      dm({ mid: "m.gone", is_deleted: true }),
      {
        sender: { id: PERSON },
        recipient: { id: ACCOUNT },
        timestamp: AT,
        reaction: { mid: "m.out", action: "react", reaction: "love", emoji: "❤" },
      },
      { sender: { id: PERSON }, recipient: { id: ACCOUNT }, timestamp: AT, read: { mid: "m.out" } },
      {
        sender: { id: PERSON },
        recipient: { id: ACCOUNT },
        timestamp: AT,
        message_edit: { mid: "m.in", text: "hello!", num_edit: 1 },
      },
      { sender: { id: PERSON }, recipient: { id: ACCOUNT }, timestamp: AT, postback: { mid: "m.tap", title: "Book" } },
      { recipient: { id: ACCOUNT }, timestamp: AT, message: { mid: "m.anon", text: "?" } },
    ),
  );
  assert.deepEqual(
    events.map((e) => [e.kind, e.account, e.kind === "ignored" ? e.what : e.mid]),
    [
      ["message", ACCOUNT, "m.in"],
      ["echo", ACCOUNT, "m.out"],
      ["unsent", ACCOUNT, "m.gone"],
      ["ignored", ACCOUNT, "reaction"],
      ["ignored", ACCOUNT, "read"],
      ["ignored", ACCOUNT, "edit"],
      ["message", ACCOUNT, "m.tap"],
      ["ignored", ACCOUNT, "unknown"],
    ],
  );
  const echo = events[1];
  assert.equal(echo.to, PERSON);
  assert.equal(echo.text, "Hi!");
  assert.equal(events[0].from, PERSON);
  assert.equal(events[2].from, PERSON);
  // A message whose sender is the account itself is the business's own, flagged or not.
  const [own] = instagramEventsOf(
    envelope({
      sender: { id: ACCOUNT },
      recipient: { id: PERSON },
      timestamp: AT,
      message: { mid: "m.own", text: "x" },
    }),
  );
  assert.equal(own.kind, "echo");
});

test("anything that is not Instagram's envelope reads as no events, never a throw", () => {
  for (const body of [
    null,
    "x",
    [],
    {},
    { object: "page", entry: [{ id: ACCOUNT, messaging: [dm({ text: "hi" })] }] },
    { object: "instagram", entry: "x" },
    { object: "instagram", entry: [{ messaging: [dm({ text: "hi" })] }] },
  ])
    assert.deepEqual(instagramEventsOf(body), []);
});

test("Meta's signature over the raw body proves a delivery, with either of the app's secrets, and nothing else does", () => {
  const raw = JSON.stringify(envelope(dm({ text: "hi" })));
  const sign = (secret, body = raw) => "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(metaSignatureValid(raw, sign("ig-secret"), ["ig-secret"]), true);
  // An Instagram Login app signs with its Instagram app secret; its Meta app secret is held as the second key.
  assert.equal(metaSignatureValid(raw, sign("meta-secret"), ["ig-secret", "meta-secret"]), true);
  assert.equal(metaSignatureValid(raw + " ", sign("ig-secret"), ["ig-secret"]), false);
  assert.equal(metaSignatureValid(raw, sign("someone-else"), ["ig-secret"]), false);
  assert.equal(metaSignatureValid(raw, null, ["ig-secret"]), false);
  assert.equal(metaSignatureValid(raw, sign("ig-secret").slice(7), ["ig-secret"]), false);
  // No secret at all is a configuration fault, never a verification skipped.
  assert.equal(metaSignatureValid(raw, sign(""), []), false);
  assert.equal(metaSignatureValid(raw, sign(""), [undefined, ""]), false);
});
