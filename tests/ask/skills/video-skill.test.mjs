/**
 * Ask's second skill, the video maker (decision 0126): how a video's blocks have been arranged well, as written advice and
 * nothing else. Ask arranges a video itself, so the skill has no craft call behind it: its guide is all of it, put into the
 * turn whose question asks for a video, in English or Spanish, and read with the guide tool where the words did not ask.
 * It was the tail of the video tool's own description until 13 November 2026, where every owner's tools block carried it
 * (tests/ask/tools/ask-tools-size.test.mjs: 129,998 of 130,000 characters that day).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";
import { VIDEO_GUIDE_MAX, VIDEO_SKILL } from "../../../apps/dashboard/src/server/ask/skills/video/skill.ts";
import {
  ASK_SKILL_IDS,
  isAskSkillId,
  skillGuide,
  skillsAsked,
} from "../../../apps/dashboard/src/server/ask/skills/registry.ts";

test("the video maker is its guide: each way a video has been arranged well, as advice, in one block of the turn", () => {
  const block = skillGuide("video");
  assert.equal(block, C.guideBlock(VIDEO_SKILL), "a skill's guide by its id is its own guide block");
  assert.ok(block.startsWith("Skill: Video maker."));
  for (const way of ["Hook first:", "Before and after:", "Steps:", "A review:", "From photos:", "Words only"])
    assert.ok(block.includes(way), way);
  assert.match(block, /advice, not forms/);
  // What the judged pieces taught (12 Nov 2026): say what changed, say a review once, in its own words alone.
  assert.match(block, /Open with what changed/);
  assert.match(block, /one quote card/);
  assert.match(block, /never the review reworded/);
  assert.match(block, /nothing is said that the owner or a client did not say/);
  // With no craft call behind it the guide holds every rule, so it may run longer than a craft skill's short form.
  assert.ok(C.SKILL_GUIDE_MAX < VIDEO_GUIDE_MAX);
  assert.ok(block.length <= VIDEO_GUIDE_MAX, `${block.length} characters`);
  assert.ok(isAskSkillId("video"));
  assert.deepEqual(ASK_SKILL_IDS, ["customer_message", "video"]);
});

test("a question's own words ask for it, in English and Spanish, and only then", () => {
  for (const q of [
    "Make a video of my color work",
    "can you put together a reel from what I filmed today?",
    "Make a before and after from my clips",
    "something for TikTok from my photos",
    "Hazme un vídeo con mis fotos",
    "un reel de antes y después, por favor",
    "haz un video de la grabación de ayer",
  ])
    assert.deepEqual(skillsAsked(q), ["video"], q);
  for (const q of [
    "who wrote this week?",
    "how many calls came in today?",
    "¿quién me escribió hoy?",
    "Write a win-back for people who haven't been in since summer",
    "move tomorrow's post to Friday",
  ])
    assert.ok(!skillsAsked(q).includes("video"), q);
});
