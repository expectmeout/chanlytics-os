/**
 * The ready-made starters the AI's drafter is offered beside the business's own messages (the review of 15 Nov 2026: it
 * wrote a new message where a starter fit, so New's main way in never used one, and a starter the owner picked was
 * dropped when the AI changed the draft, since nothing told it what the step sent). Each starter offered here that no
 * message on file is named for, keyed after the business's own, made the one way New makes it (lib/starter-message.ts),
 * in the language the business's customers are written to in. A step that names one is kept by its key, and Keep or
 * Start files it (drafts/sequence-new.ts templateOf).
 */
import "server-only";
import { startersOffered, type CampaignMessage } from "@chanlytics/contracts";
import { starterLanguageOf, starterMessageOf } from "@/lib/starter-message";
import type { KnownMessage } from "../campaigns/sequences/draft-judge";

/**
 * The starters a draft may send, as the drafter is told them: `onFile` the workspace's messages (every row, hidden ones
 * too, so one it put away is never offered as new), `from` how many keys the business's own took.
 */
export function knownStartersOf(
  onFile: readonly Pick<CampaignMessage, "name">[],
  here: { reviewLink: boolean; languages: readonly string[]; from: number },
): KnownMessage[] {
  const held = new Set(onFile.map((message) => message.name));
  return startersOffered({ reviewLink: here.reviewLink })
    .filter((starter) => !held.has(starter.name))
    .map((starter, at) => {
      const message = starterMessageOf(starter, starterLanguageOf(starter, here.languages));
      return {
        key: `k${here.from + at + 1}`,
        templateId: null,
        starter: starter.key,
        title: message.title,
        body: message.body,
        offer: message.offer,
        channels: message.channels,
        slots: message.params.map((param) => param.kind),
        ...(message.labels ? { labels: message.labels } : {}),
      };
    });
}
