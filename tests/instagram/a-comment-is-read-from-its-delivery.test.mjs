/**
 * What Meta delivers about a post, read (the first-post sitting, 21 Nov 2026: answers 5-6 and 6.2; the content loop
 * PRD's 7 and Appendix A.3 to A.5): a person's comment names its post by the id Chanlytics keeps and its own id; the
 * business's own comment is told apart by its author being the account; a mention is the same comment again and is
 * not a second one; a comment left on an ad names the ad (00719); an ig.me link that opens an existing chat arrives as
 * its code alone; a reply to a story keeps the story's id.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inboundFromInstagram, instagramEventsOf } from "@chanlytics/channels/instagram";

const ACCOUNT = "17841475892921836";
const PERSON = "990000000003087";
const change = (field, value) => ({
  object: "instagram",
  entry: [{ id: ACCOUNT, time: 1763764642, changes: [{ field, value }] }],
});

test("a person's comment on the reel is a comment, naming the post, its own id, its words and who wrote it", () => {
  const [event] = instagramEventsOf(
    change("comments", {
      from: { id: PERSON, username: "second.account" },
      media: { id: "18103022591544444", media_product_type: "REELS" },
      id: "18452487913135080",
      text: "how much is this?",
    }),
  );
  assert.equal(event.kind, "comment");
  assert.equal(event.account, ACCOUNT);
  assert.equal(event.from, PERSON);
  assert.equal(event.username, "second.account");
  assert.equal(event.commentId, "18452487913135080");
  assert.equal(event.mediaId, "18103022591544444");
  assert.equal(event.parentId, null);
  assert.equal(event.text, "how much is this?");
  assert.equal(event.atIso, new Date(1763764642 * 1000).toISOString());
  assert.equal(event.adId, null, "a comment on the post itself names no ad");
});

test("a comment left on an ad names the ad Meta says it was left on, and an id that is not one names none", () => {
  const onAd = (ad_id) =>
    instagramEventsOf(
      change("comments", {
        from: { id: PERSON, username: "second.account" },
        media: { id: "18103022591544444", media_product_type: "FEED", ad_id, ad_title: "Boost: first visit" },
        id: "18452487913135081",
        text: "do you have openings friday?",
      }),
    )[0];
  assert.equal(onAd("120243112410030512").adId, "120243112410030512");
  assert.equal(onAd(" 120243112410030512 ").adId, "120243112410030512");
  assert.equal(onAd("not an ad").adId, null);
  assert.equal(onAd(undefined).adId, null);
});

test("a reply inside a thread names the thread's first comment as its parent", () => {
  const [event] = instagramEventsOf(
    change("comments", {
      from: { id: PERSON, username: "second.account" },
      media: { id: "18103022591544444", media_product_type: "REELS" },
      id: "18113885834244446",
      parent_id: "18452487913135080",
      text: "@chanlytics thanks!",
    }),
  );
  assert.equal(event.kind, "comment");
  assert.equal(event.parentId, "18452487913135080");
});

test("the business's own comment is never a person's: its author is the account", () => {
  const [event] = instagramEventsOf(
    change("comments", {
      from: { id: ACCOUNT, username: "chanlytics", self_ig_scoped_id: "x" },
      media: { id: "18113362325625379", media_product_type: "FEED" },
      id: "17924353128446040",
      parent_id: "18099989417666712",
      text: "@second.account glad you like it",
    }),
  );
  assert.equal(event.kind, "own_comment");
  assert.equal(event.commentId, "17924353128446040");
  assert.equal(event.parentId, "18099989417666712");
  assert.equal("text" in event, false, "the business's own words are not read off its own comment");
});

test("a mention is the same comment delivered again, and asks nothing", () => {
  const [event] = instagramEventsOf(
    change("mentions", { media_id: "18103022591544444", comment_id: "18345968431302941" }),
  );
  assert.deepEqual(event, { kind: "ignored", account: ACCOUNT, what: "mention" });
});

test("a comment missing its post, its id or its author is nothing to act on", () => {
  for (const value of [
    { from: { id: PERSON }, id: "1", text: "x" },
    { from: { id: PERSON }, media: { id: "2" }, text: "x" },
    { media: { id: "2" }, id: "1", text: "x" },
  ])
    assert.equal(instagramEventsOf(change("comments", value))[0].kind, "ignored");
});

test("an ig.me link that opens a chat already under way arrives as its code alone, and is kept as an opening", () => {
  const body = {
    object: "instagram",
    entry: [
      {
        id: ACCOUNT,
        time: 1763766109000,
        messaging: [
          {
            sender: { id: PERSON },
            recipient: { id: ACCOUNT },
            timestamp: 1763766109000,
            referral: { ref: "p1a-ig2", source: "SHORTLINK", type: "OPEN_THREAD" },
          },
        ],
      },
    ],
  };
  const [event] = instagramEventsOf(body);
  assert.equal(event.kind, "opened");
  assert.equal(event.from, PERSON);
  assert.equal(event.ref, "p1a-ig2");
  assert.equal(event.atIso, new Date(1763766109000).toISOString());
});

test("a reply to a story keeps the story's id on the message, the id the post keeps", () => {
  const item = {
    sender: { id: PERSON },
    recipient: { id: ACCOUNT },
    timestamp: 1763765312000,
    message: {
      mid: "mid-1",
      text: "love this",
      reply_to: { story: { url: "https://lookaside.example.com/x", id: "18137384053594518" } },
    },
  };
  const message = inboundFromInstagram(item, null);
  assert.deepEqual(message.answered, { story: "18137384053594518" });
  const plain = inboundFromInstagram({ ...item, message: { mid: "mid-2", text: "hi" } }, null);
  assert.equal(plain.answered, null);
});
