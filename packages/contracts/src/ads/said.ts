/**
 * What an ad said where a person tapped it (decision 0049, step P0a): the shape `ad_entries.said` holds, and the one
 * that crosses from the reader of a referral (channels) to the door that keeps it (db) and on to the page that names the
 * ad. A part the ad did not say, or said in a shape that is not kept, is left out, never null.
 */
export interface AdSaid {
  headline?: string;
  /** The ad's own words. */
  body?: string;
  /** The platform's word for the ad's media: Meta's are `image` and `video`. */
  media_type?: string;
  /** The ad's own address at its platform, as the referral gave it. Never a click id. */
  link?: string;
}

/**
 * How much of what an ad said AI is told, in characters (decision 0049, call 12): the entry keeps more (a headline of
 * 300, words of 2,000: channels AD_SAID_MAX), but a reply needs what the ad offered, not all of it, and the ad is read
 * on every turn of the conversation it began. The note about a person cuts what it tells to these (db ad-tap.ts), and
 * the trial door takes an ad of no more (rehearsal edge-doors.ts), so a trial shows the model what a live turn can.
 */
export const AD_TOLD_MAX = { name: 120, headline: 160, body: 600 } as const;
